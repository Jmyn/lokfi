/**
 * Crypto.com Exchange brokerage provider — wraps CdcHttpClient, fetches
 * data from the Exchange v1 API, and maps responses to normalized types.
 *
 * Implements BrokerageProvider from @lokfi/brokerage-core.
 *
 * API constraints this provider works around:
 *   - get-trades: ≤7-day window, ≤100 rows/request, 1 req/s
 *   - get-transactions: ≤100 rows/request, 1 req/s, cursor pagination
 *   - history retention ~6 months (provider declares maxLookbackDays: 180)
 *   - staking reward history: ≤180-day lookback, ≤500 rows/request
 *   - deposit/withdrawal history: master-account only, permission-gated
 */

import type {
  BrokerageAccount,
  BrokerageFundDetail,
  BrokerageKlineBar,
  BrokeragePosition,
  BrokerageTransaction,
} from '@lokfi/brokerage-core'
import type { BrokerageProvider, ProviderProgress } from '@lokfi/brokerage-core'
import {
  SOURCE,
  adaptCandles,
  adaptDepositRecord,
  adaptJournalEntry,
  adaptPositionBalance,
  adaptStakingReward,
  adaptTrade,
  adaptUserBalance,
  adaptWithdrawalRecord,
  dedupeTransfers,
  num,
} from './cdc-adapter'
import { CdcAuthError, CdcHttpClient } from './cdc-http-client'
import type {
  CdcCandlestickResult,
  CdcClientConfig,
  CdcDepositHistoryResult,
  CdcDepositRecord,
  CdcInstrument,
  CdcInstrumentsResult,
  CdcJournalEntry,
  CdcStakingRewardHistoryResult,
  CdcTimeframe,
  CdcTrade,
  CdcTradesResult,
  CdcTransactionsResult,
  CdcUserBalanceResult,
  CdcWithdrawalHistoryResult,
  CdcWithdrawalRecord,
} from './cdc-types'

export interface CdcProviderOptions {
  config: CdcClientConfig
  /**
   * Enable the Wallet API (deposit/withdrawal history) and Staking API
   * (reward history). These endpoint families do NOT send CORS headers, so
   * they are unreachable from a browser and OFF by default — attempting them
   * only produces console CORS errors. Transfers still come through the
   * journal regardless; only staking rewards and txid/fee enrichment are lost.
   *
   * Set to true only when requests are routed through a same-origin proxy
   * (see CdcClientConfig.serverUrl), which makes these endpoints reachable.
   */
  enableProxiedEndpoints?: boolean
}

const PAGE_LIMIT = 100
const TRADES_CHUNK_DAYS = 7
/** get-trades / get-transactions are limited to 1 req/s — pace with margin */
const HISTORY_REQUEST_DELAY_MS = 1100
const WALLET_PAGE_SIZE = 200
const STAKING_LOOKBACK_DAYS = 180
const STAKING_PAGE_LIMIT = 500
/** Hard stop for cursor pagination within one window (100 rows × 200 = 20k) */
const MAX_PAGES_PER_WINDOW = 200

const DAY_MS = 24 * 60 * 60 * 1000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Whether an error means an *optional* enrichment endpoint can't be reached
 * and the sync should degrade gracefully rather than fail.
 *
 * Two causes, both expected for the Wallet and Staking endpoint families:
 *   - `CdcAuthError` — the API key lacks the permission (master-only, gated).
 *   - `TypeError` ("Failed to fetch") — the endpoint doesn't send CORS
 *     headers, so the browser blocks it. The Crypto.com Exchange serves
 *     CORS for trading/account/ledger endpoints but NOT for the Wallet
 *     (deposit/withdrawal history) or Staking endpoint families, so these
 *     are unreachable from a browser without a same-origin proxy.
 */
function isOptionalEndpointUnavailable(error: unknown): boolean {
  return error instanceof CdcAuthError || error instanceof TypeError
}

/** Short, log-friendly description distinguishing CORS/network from API errors */
function describeError(error: unknown): string {
  if (error instanceof TypeError) return `network/CORS error (${error.message})`
  if (error instanceof Error) return error.message
  return String(error)
}

const TIMEFRAME_BY_PERIOD: Record<'day' | 'week' | 'month', CdcTimeframe> = {
  day: '1D',
  week: '7D',
  month: '1M',
}

const PERIOD_DAYS: Record<'day' | 'week' | 'month', number> = {
  day: 1,
  week: 7,
  month: 30,
}

export class CdcProvider implements BrokerageProvider {
  readonly source = SOURCE
  readonly displayName = 'Crypto.com Exchange'
  /** Exchange retains order/trade/transaction history for ~6 months */
  readonly maxLookbackDays = 180

  private client: CdcHttpClient
  /** Whether to call the CORS-blocked Wallet + Staking endpoint families */
  private proxiedEndpoints: boolean
  private instrumentsCache: CdcInstrument[] | null = null
  /** Daily close price cache: token → (yyyy-mm-dd → close) */
  private dailyCloseCache = new Map<string, Map<string, number>>()

  constructor(options: CdcProviderOptions) {
    this.client = new CdcHttpClient(options.config)
    this.proxiedEndpoints = options.enableProxiedEndpoints ?? false
  }

  // ── Account & positions ─────────────────────────────────────────────────

  async fetchAccount(_onProgress?: ProviderProgress): Promise<BrokerageAccount[]> {
    const result = await this.client.execute<CdcUserBalanceResult>({
      method: 'private/user-balance',
    })
    const balances = result?.data ?? []
    return balances.map(adaptUserBalance)
  }

  async fetchPositions(_onProgress?: ProviderProgress): Promise<BrokeragePosition[]> {
    const result = await this.client.execute<CdcUserBalanceResult>({
      method: 'private/user-balance',
    })
    const balances = result?.data ?? []
    const positionBalances = balances.flatMap((b) => b.position_balances ?? [])
    return positionBalances.map(adaptPositionBalance).filter((p): p is BrokeragePosition => p !== null)
  }

  async validateConnection(): Promise<boolean> {
    try {
      await this.client.execute<CdcUserBalanceResult>({ method: 'private/user-balance' })
      return true
    } catch {
      return false
    }
  }

  // ── Transactions (trade fills) ──────────────────────────────────────────

  /**
   * Fetch fills in ≤7-day windows (API limit for get-trades), paginating
   * each window by sliding the end_time cursor backwards. Dedup by trade
   * id guards both the cursor overlap and chunk boundaries.
   */
  async fetchTransactions(since: Date, onProgress?: ProviderProgress): Promise<BrokerageTransaction[]> {
    const chunks = this.getDateChunks(since, new Date(), TRADES_CHUNK_DAYS)
    const seen = new Set<string>()
    const all: BrokerageTransaction[] = []

    for (let i = 0; i < chunks.length; i++) {
      const { start, end } = chunks[i]
      onProgress?.(
        `Fetching trades chunk ${i + 1}/${chunks.length} (${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)})`
      )

      const rows = await this.paginateByCursor<CdcTrade>(
        'private/get-trades',
        start.getTime(),
        end.getTime(),
        (params) =>
          this.client.execute<CdcTradesResult>({ method: 'private/get-trades', params }).then((r) => r?.data ?? []),
        (row) => row.create_time,
        (row) => row.trade_id
      )

      for (const raw of rows) {
        const txn = adaptTrade(raw)
        if (txn && !seen.has(txn.id) && new Date(txn.executedAt) >= since) {
          seen.add(txn.id)
          all.push(txn)
        }
      }

      if (i < chunks.length - 1) await sleep(HISTORY_REQUEST_DELAY_MS)
    }

    return all
  }

  // ── Fund details (ledger + wallet + staking) ────────────────────────────

  async fetchFundDetails(since: Date, onProgress?: ProviderProgress): Promise<BrokerageFundDetail[]> {
    const now = new Date()

    // 1. Account journal (private/get-transactions)
    onProgress?.('Fetching account journal...')
    const journalRows = await this.paginateByCursor<CdcJournalEntry>(
      'private/get-transactions',
      since.getTime(),
      now.getTime(),
      (params) =>
        this.client
          .execute<CdcTransactionsResult>({ method: 'private/get-transactions', params })
          .then((r) => r?.data ?? []),
      (row) => row.event_timestamp_ms,
      (row) => row.journal_id
    )
    const journalDetails = journalRows.map(adaptJournalEntry).filter((fd): fd is BrokerageFundDetail => fd !== null)

    // The Wallet (deposit/withdrawal history) and Staking (reward history)
    // endpoint families are not CORS-accessible from a browser, so they are
    // skipped unless requests are routed through a proxy. Transfers still
    // come through the journal above; only staking rewards and txid/fee
    // enrichment are unavailable in the default browser-only mode.
    if (!this.proxiedEndpoints) {
      onProgress?.('Staking rewards and deposit/withdrawal enrichment skipped (require a proxy)')
      return journalDetails
    }

    // 2. Wallet deposit/withdrawal history (permission-gated, master only)
    await sleep(HISTORY_REQUEST_DELAY_MS)
    const walletDetails = await this.fetchWalletHistory(since, now, onProgress)

    // 3. Staking rewards (≤180-day lookback)
    const stakingDetails = await this.fetchStakingRewards(since, now, onProgress)

    // Wallet records are richer than the journal's ONCHAIN_* entries —
    // drop journal duplicates so each transfer appears once.
    const dedupedJournal = dedupeTransfers(journalDetails, walletDetails)

    return [...dedupedJournal, ...walletDetails, ...stakingDetails]
  }

  /** Fetch deposit + withdrawal history; degrade gracefully when permission-gated */
  private async fetchWalletHistory(
    since: Date,
    until: Date,
    onProgress?: ProviderProgress
  ): Promise<BrokerageFundDetail[]> {
    const details: BrokerageFundDetail[] = []

    try {
      onProgress?.('Fetching deposit history...')
      const deposits = await this.paginateWallet<CdcDepositHistoryResult, CdcDepositRecord>(
        'private/get-deposit-history',
        since,
        until,
        (r) => r?.deposit_list ?? []
      )
      for (const raw of deposits) {
        const fd = adaptDepositRecord(raw)
        if (fd) details.push(fd)
      }

      await sleep(HISTORY_REQUEST_DELAY_MS)
      onProgress?.('Fetching withdrawal history...')
      const withdrawals = await this.paginateWallet<CdcWithdrawalHistoryResult, CdcWithdrawalRecord>(
        'private/get-withdrawal-history',
        since,
        until,
        (r) => r?.withdrawal_list ?? []
      )
      for (const raw of withdrawals) {
        const fd = adaptWithdrawalRecord(raw)
        if (fd) details.push(fd)
      }
    } catch (error) {
      if (isOptionalEndpointUnavailable(error)) {
        // Wallet endpoints are permission-gated/master-only, and the browser
        // also blocks them on CORS. Transfers still come through the journal
        // (ONCHAIN_DEPOSIT/WITHDRAWAL); we only lose txid/fee/status enrichment.
        onProgress?.('Deposit/withdrawal history unavailable in-browser — using journal transfers only')
        console.warn('[cdc-provider] Wallet history unavailable, skipping:', describeError(error))
        return details
      }
      throw error
    }

    return details
  }

  /** Page-based pagination for the wallet history endpoints */
  private async paginateWallet<R, Row>(
    method: string,
    since: Date,
    until: Date,
    extract: (result: R) => Row[]
  ): Promise<Row[]> {
    const rows: Row[] = []
    for (let page = 0; page < 50; page++) {
      const result = await this.client.execute<R>({
        method,
        params: {
          start_ts: since.getTime(),
          end_ts: until.getTime(),
          page_size: WALLET_PAGE_SIZE,
          page,
        },
      })
      const pageRows = extract(result)
      rows.push(...pageRows)
      if (pageRows.length < WALLET_PAGE_SIZE) break
      await sleep(HISTORY_REQUEST_DELAY_MS)
    }
    return rows
  }

  /** Fetch staking reward history, valuing rewards at the event-date close */
  private async fetchStakingRewards(
    since: Date,
    until: Date,
    onProgress?: ProviderProgress
  ): Promise<BrokerageFundDetail[]> {
    // The API caps reward history lookback at 180 days
    const minStart = new Date(until.getTime() - STAKING_LOOKBACK_DAYS * DAY_MS + DAY_MS)
    const start = since > minStart ? since : minStart
    if (since < minStart) {
      onProgress?.(`Staking rewards limited to 180 days by the exchange (from ${start.toISOString().slice(0, 10)})`)
    } else {
      onProgress?.('Fetching staking rewards...')
    }

    let rewards: CdcStakingRewardHistoryResult['data']
    try {
      await sleep(HISTORY_REQUEST_DELAY_MS)
      const result = await this.client.execute<CdcStakingRewardHistoryResult>({
        method: 'private/staking/get-reward-history',
        params: {
          start_time: start.getTime(),
          end_time: until.getTime(),
          limit: STAKING_PAGE_LIMIT,
        },
      })
      rewards = result?.data ?? []
    } catch (error) {
      if (isOptionalEndpointUnavailable(error)) {
        // The Staking endpoint family isn't CORS-accessible from a browser
        // (and may be permission-gated). Skip rewards rather than fail the
        // whole fund_details category.
        onProgress?.('Staking rewards unavailable in-browser — skipping')
        console.warn('[cdc-provider] Staking reward history unavailable, skipping:', describeError(error))
        return []
      }
      throw error
    }

    const details: BrokerageFundDetail[] = []
    for (const reward of rewards) {
      const token = (reward.underlying_inst_name || reward.staking_inst_name).replace('.staked', '')
      const date = new Date(num(reward.event_timestamp_ms)).toISOString().slice(0, 10)
      const price = await this.getDailyClose(token, date)
      const fd = adaptStakingReward(reward, price)
      if (fd) details.push(fd)
    }
    return details
  }

  // ── Historical bars ─────────────────────────────────────────────────────

  async fetchHistoricalBars(
    symbol: string,
    period: 'day' | 'week' | 'month',
    lookbackDays: number
  ): Promise<BrokerageKlineBar[]> {
    const instrument = await this.resolveInstrument(symbol)
    const timeframe = TIMEFRAME_BY_PERIOD[period]
    const barCount = Math.ceil(lookbackDays / PERIOD_DAYS[period])

    const result = await this.client.execute<CdcCandlestickResult>({
      method: 'public/get-candlestick',
      params: {
        instrument_name: instrument.symbol,
        timeframe,
        // Small buffer over the requested lookback; default count is only 25
        count: barCount + 5,
        start_ts: Date.now() - (lookbackDays + 5 * PERIOD_DAYS[period]) * DAY_MS,
        end_ts: Date.now(),
      },
    })

    const candles = [...(result?.data ?? [])].sort((a, b) => num(a.t) - num(b.t))
    const recent = candles.length > barCount ? candles.slice(-barCount) : candles
    return adaptCandles(symbol, recent, period)
  }

  /** Resolve a token symbol to its preferred tradable instrument (USD quote first) */
  private async resolveInstrument(token: string): Promise<CdcInstrument> {
    if (!this.instrumentsCache) {
      const result = await this.client.execute<CdcInstrumentsResult>({ method: 'public/get-instruments' })
      this.instrumentsCache = result?.data ?? []
    }

    // Spot pairs only — perpetuals/futures share base_ccy/quote_ccy and
    // would otherwise shadow the spot instrument (e.g. "1INCHUSD-PERP")
    const candidates = this.instrumentsCache.filter(
      (i) => i.base_ccy === token && i.inst_type === 'CCY_PAIR' && i.tradable !== false
    )
    const preferred =
      candidates.find((i) => i.quote_ccy === 'USD') ??
      candidates.find((i) => i.quote_ccy === 'USDT') ??
      candidates.find((i) => i.quote_ccy === 'USDC') ??
      candidates[0]

    if (!preferred) {
      throw new Error(`Crypto.com: no tradable instrument found for symbol "${token}"`)
    }
    return preferred
  }

  /** Daily close for a token on a yyyy-mm-dd date (cached per token) */
  async getDailyClose(token: string, date: string): Promise<number | null> {
    let tokenCache = this.dailyCloseCache.get(token)
    if (tokenCache?.has(date)) return tokenCache.get(date) ?? null

    try {
      const targetTs = new Date(`${date}T00:00:00Z`).getTime()
      const instrument = await this.resolveInstrument(token)
      const result = await this.client.execute<CdcCandlestickResult>({
        method: 'public/get-candlestick',
        params: {
          instrument_name: instrument.symbol,
          timeframe: '1D',
          start_ts: targetTs - 2 * DAY_MS,
          end_ts: targetTs + 2 * DAY_MS,
          count: 5,
        },
      })

      if (!tokenCache) {
        tokenCache = new Map()
        this.dailyCloseCache.set(token, tokenCache)
      }
      for (const candle of result?.data ?? []) {
        tokenCache.set(new Date(num(candle.t)).toISOString().slice(0, 10), num(candle.c))
      }
      return tokenCache.get(date) ?? null
    } catch (error) {
      console.warn(`[cdc-provider] Daily close lookup failed for ${token} @ ${date}:`, error)
      return null
    }
  }

  // ── Pagination helpers ──────────────────────────────────────────────────

  /**
   * Cursor pagination shared by get-trades and get-transactions: query
   * [startMs, cursor) with limit 100, slide the cursor to the oldest row's
   * timestamp, repeat until a short page or no new rows. Row-id dedup makes
   * the +1ms cursor overlap safe.
   */
  private async paginateByCursor<Row>(
    _method: string,
    startMs: number,
    endMs: number,
    fetchPage: (params: Record<string, unknown>) => Promise<Row[]>,
    rowTime: (row: Row) => number,
    rowId: (row: Row) => string
  ): Promise<Row[]> {
    const seen = new Set<string>()
    const rows: Row[] = []
    let cursor = endMs

    for (let page = 0; page < MAX_PAGES_PER_WINDOW; page++) {
      const pageRows = await fetchPage({
        start_time: startMs,
        end_time: cursor,
        limit: PAGE_LIMIT,
      })

      let oldest = cursor
      let newCount = 0
      for (const row of pageRows) {
        const id = rowId(row)
        if (!seen.has(id)) {
          seen.add(id)
          rows.push(row)
          newCount++
        }
        const t = rowTime(row)
        if (t < oldest) oldest = t
      }

      // Short page → window exhausted. All-duplicates → same-ms cluster
      // bigger than the page size; bail rather than loop forever.
      if (pageRows.length < PAGE_LIMIT || newCount === 0) break

      // +1ms keeps boundary rows visible; dedup by id removes the overlap
      cursor = oldest + 1
      if (cursor <= startMs) break

      await sleep(HISTORY_REQUEST_DELAY_MS)
    }

    return rows
  }

  /** Split a date range into chunks no larger than maxDays */
  private getDateChunks(start: Date, end: Date, maxDays: number): { start: Date; end: Date }[] {
    if (start >= end) return []

    const chunks: { start: Date; end: Date }[] = []
    const current = new Date(start)

    while (current < end) {
      const chunkEnd = new Date(Math.min(current.getTime() + maxDays * DAY_MS, end.getTime()))
      chunks.push({ start: new Date(current), end: chunkEnd })
      current.setTime(chunkEnd.getTime())
    }

    return chunks
  }
}
