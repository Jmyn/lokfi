import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CdcAuthError } from './cdc-http-client'
import { CdcProvider } from './cdc-provider'
import type { CdcApiRequest, CdcJournalEntry, CdcTrade } from './cdc-types'

/** Build a provider with a mocked HTTP client */
function makeProvider(
  execute: (request: CdcApiRequest) => Promise<unknown>,
  options?: { enableProxiedEndpoints?: boolean }
) {
  const provider = new CdcProvider({ config: { apiKey: 'k', apiSecret: 's' }, ...options })
  // Replace the private client with a stub — unit tests never hit the network
  ;(provider as unknown as { client: { execute: typeof execute } }).client = { execute }
  return provider
}

function makeTrade(overrides: Partial<CdcTrade>): CdcTrade {
  return {
    account_id: 'a1',
    event_date: '2026-06-01',
    journal_type: 'TRADING',
    traded_quantity: '1',
    traded_price: '100',
    fees: '-0.1',
    fee_instrument_name: 'USD',
    order_id: 'o-1',
    trade_id: 't-1',
    side: 'BUY',
    instrument_name: 'BTC_USD',
    create_time: Date.now() - 1000,
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('fetchTransactions', () => {
  it('chunks long ranges into ≤7-day windows and dedupes across pages', async () => {
    const calls: Array<Record<string, unknown>> = []
    const provider = makeProvider(async (request) => {
      if (request.method !== 'private/get-trades') throw new Error(`unexpected ${request.method}`)
      calls.push(request.params ?? {})
      return { data: [makeTrade({ trade_id: `t-${calls.length}` })] }
    })

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const promise = provider.fetchTransactions(since)
    await vi.runAllTimersAsync()
    const txns = await promise

    // 30 days → 5 windows of ≤7 days, one short page each
    expect(calls.length).toBe(5)
    for (const params of calls) {
      const windowMs = (params.end_time as number) - (params.start_time as number)
      expect(windowMs).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000)
      expect(params.limit).toBe(100)
    }
    expect(txns.length).toBe(5)
    expect(new Set(txns.map((t) => t.id)).size).toBe(5)
  })

  it('slides the cursor when a window returns a full page', async () => {
    let call = 0
    const now = Date.now()
    const provider = makeProvider(async () => {
      call++
      if (call === 1) {
        // Full page of 100 unique trades
        return {
          data: Array.from({ length: 100 }, (_, i) =>
            makeTrade({ trade_id: `t-${i}`, create_time: now - 1000 - i * 1000 })
          ),
        }
      }
      // Second page: short → stop
      return { data: [makeTrade({ trade_id: 'older', create_time: now - 200_000 })] }
    })

    const since = new Date(now - 3 * 24 * 60 * 60 * 1000)
    const promise = provider.fetchTransactions(since)
    await vi.runAllTimersAsync()
    const txns = await promise

    expect(call).toBe(2)
    expect(txns.length).toBe(101)
  })
})

describe('fetchFundDetails — browser-only (default)', () => {
  it('returns journal entries only and never calls the CORS-blocked wallet/staking endpoints', async () => {
    const journalEntry: CdcJournalEntry = {
      account_id: 'a1',
      event_date: '2026-06-01',
      journal_type: 'ONCHAIN_DEPOSIT',
      journal_id: 'j-2',
      transaction_qty: '0.5',
      transaction_cost: '0',
      instrument_name: 'BTC',
      event_timestamp_ms: Date.now() - 1000,
    }
    const calledMethods: string[] = []
    const progress: string[] = []
    const provider = makeProvider(async (request) => {
      calledMethods.push(request.method)
      if (request.method === 'private/get-transactions') return { data: [journalEntry] }
      throw new Error(`should not call ${request.method} in browser-only mode`)
    })

    const promise = provider.fetchFundDetails(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), (m) => progress.push(m))
    await vi.runAllTimersAsync()
    const details = await promise

    expect(details).toHaveLength(1)
    expect(details[0]?.classifiedType).toBe('TRANSFER_IN')
    // The wallet + staking endpoints must not be attempted at all
    expect(calledMethods).not.toContain('private/get-deposit-history')
    expect(calledMethods).not.toContain('private/get-withdrawal-history')
    expect(calledMethods).not.toContain('private/staking/get-reward-history')
    expect(progress.some((m) => m.includes('require a proxy'))).toBe(true)
  })
})

describe('fetchFundDetails — proxy mode (enableProxiedEndpoints)', () => {
  it('continues with journal + staking when deposit history is permission-gated', async () => {
    const journalEntry: CdcJournalEntry = {
      account_id: 'a1',
      event_date: '2026-06-01',
      journal_type: 'TRADE_FEE',
      journal_id: 'j-1',
      transaction_qty: '0',
      transaction_cost: '-1',
      event_timestamp_ms: Date.now() - 1000,
    }
    const progress: string[] = []
    const provider = makeProvider(
      async (request) => {
        switch (request.method) {
          case 'private/get-transactions':
            return { data: [journalEntry] }
          case 'private/get-deposit-history':
            throw new CdcAuthError(40103, 'IP address not whitelisted')
          case 'private/staking/get-reward-history':
            return { data: [] }
          default:
            throw new Error(`unexpected ${request.method}`)
        }
      },
      { enableProxiedEndpoints: true }
    )

    const promise = provider.fetchFundDetails(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), (m) => progress.push(m))
    await vi.runAllTimersAsync()
    const details = await promise

    expect(details).toHaveLength(1)
    expect(details[0]?.classifiedType).toBe('FEE')
    expect(progress.some((m) => m.includes('unavailable'))).toBe(true)
  })

  it('degrades to journal entries when wallet + staking fail (CORS/network) even with the proxy flag', async () => {
    // Defensive: if proxied endpoints are enabled but still fail (proxy
    // misconfigured), fetchFundDetails must degrade rather than crash.
    const journalEntry: CdcJournalEntry = {
      account_id: 'a1',
      event_date: '2026-06-01',
      journal_type: 'ONCHAIN_DEPOSIT',
      journal_id: 'j-2',
      transaction_qty: '0.5',
      transaction_cost: '0',
      instrument_name: 'BTC',
      event_timestamp_ms: Date.now() - 1000,
    }
    const progress: string[] = []
    const provider = makeProvider(
      async (request) => {
        switch (request.method) {
          case 'private/get-transactions':
            return { data: [journalEntry] }
          case 'private/get-deposit-history':
          case 'private/get-withdrawal-history':
          case 'private/staking/get-reward-history':
            throw new TypeError('Failed to fetch')
          default:
            throw new Error(`unexpected ${request.method}`)
        }
      },
      { enableProxiedEndpoints: true }
    )

    const promise = provider.fetchFundDetails(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), (m) => progress.push(m))
    await vi.runAllTimersAsync()
    const details = await promise

    expect(details).toHaveLength(1)
    expect(details[0]?.classifiedType).toBe('TRANSFER_IN')
    expect(progress.some((m) => m.includes('Deposit/withdrawal history unavailable'))).toBe(true)
    expect(progress.some((m) => m.includes('Staking rewards unavailable'))).toBe(true)
  })

  it('rethrows genuine (non-CORS, non-auth) wallet errors', async () => {
    const provider = makeProvider(
      async (request) => {
        switch (request.method) {
          case 'private/get-transactions':
            return { data: [] }
          case 'private/get-deposit-history':
            // A plain Error (not TypeError/CdcAuthError) is an unexpected bug —
            // it must propagate, not be silently swallowed.
            throw new Error('unexpected server error')
          default:
            return { data: [] }
        }
      },
      { enableProxiedEndpoints: true }
    )

    const promise = provider.fetchFundDetails(new Date(Date.now() - 1000))
    const expectation = expect(promise).rejects.toThrow('unexpected server error')
    await vi.runAllTimersAsync()
    await expectation
  })
})

describe('fetchHistoricalBars', () => {
  it('resolves the USD instrument and returns oldest-first daily bars', async () => {
    const dayMs = 24 * 60 * 60 * 1000
    const now = Date.now()
    const calls: Array<Record<string, unknown>> = []
    const provider = makeProvider(async (request) => {
      if (request.method === 'public/get-instruments') {
        return {
          data: [
            // Perpetual listed first with the same base/quote — must NOT be
            // selected over the spot pair (regression: live API ordering)
            { symbol: 'BTCUSD-PERP', inst_type: 'PERPETUAL_SWAP', base_ccy: 'BTC', quote_ccy: 'USD', tradable: true },
            { symbol: 'BTC_USDT', inst_type: 'CCY_PAIR', base_ccy: 'BTC', quote_ccy: 'USDT', tradable: true },
            { symbol: 'BTC_USD', inst_type: 'CCY_PAIR', base_ccy: 'BTC', quote_ccy: 'USD', tradable: true },
          ],
        }
      }
      if (request.method === 'public/get-candlestick') {
        calls.push(request.params ?? {})
        return {
          instrument_name: 'BTC_USD',
          interval: '1D',
          // Newest-first on purpose — the provider must sort ascending
          data: Array.from({ length: 96 }, (_, i) => ({
            t: now - i * dayMs,
            o: '1',
            h: '2',
            l: '0.5',
            c: String(100 + i),
            v: '10',
          })),
        }
      }
      throw new Error(`unexpected ${request.method}`)
    })

    const bars = await provider.fetchHistoricalBars('BTC', 'day', 91)

    expect(calls[0]?.instrument_name).toBe('BTC_USD')
    expect(calls[0]?.timeframe).toBe('1D')
    expect(bars.length).toBe(91)
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i]!.timestamp).toBeGreaterThan(bars[i - 1]!.timestamp)
    }
    expect(bars[0]?.symbol).toBe('BTC')
  })

  it('throws a descriptive error for unknown symbols', async () => {
    const provider = makeProvider(async (request) => {
      if (request.method === 'public/get-instruments') return { data: [] }
      throw new Error(`unexpected ${request.method}`)
    })
    await expect(provider.fetchHistoricalBars('NOPE', 'day', 91)).rejects.toThrow('NOPE')
  })
})

describe('validateConnection', () => {
  it('returns true on success and false on auth failure without throwing', async () => {
    const ok = makeProvider(async () => ({ data: [] }))
    await expect(ok.validateConnection()).resolves.toBe(true)

    const bad = makeProvider(async () => {
      throw new CdcAuthError(40101, 'bad signature')
    })
    await expect(bad.validateConnection()).resolves.toBe(false)
  })
})
