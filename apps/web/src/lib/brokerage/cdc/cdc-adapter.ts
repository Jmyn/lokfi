/**
 * Crypto.com Exchange → normalized type adapters.
 *
 * Maps raw Exchange v1 API responses into the @lokfi/brokerage-core
 * normalized types that the sync orchestrator persists to Dexie.
 *
 * The exchange has no cost basis for spot holdings, so positions are
 * adapted with avgCost = 0 and enriched afterwards by the spot cost-basis
 * engine (see spot-cost-basis.ts).
 */

import type {
  BrokerageAccount,
  BrokerageFundDetail,
  BrokerageKlineBar,
  BrokeragePosition,
  BrokerageTransaction,
  FundDetailType,
} from '@lokfi/brokerage-core'
import type {
  CdcCandle,
  CdcDepositRecord,
  CdcJournalEntry,
  CdcPositionBalance,
  CdcStakingReward,
  CdcTrade,
  CdcUserBalance,
  CdcWithdrawalRecord,
} from './cdc-types'

/** Source discriminator for all Crypto.com records */
export const SOURCE = 'cdc'

const STAKED_SUFFIX = '.staked'

/** Parse a decimal-as-string (or number) API value */
export function num(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Split an instrument pair like "BTC_USD" into base and quote */
export function splitInstrument(pair: string): { base: string; quote: string } {
  const idx = pair.indexOf('_')
  if (idx === -1) return { base: pair, quote: '' }
  return { base: pair.slice(0, idx), quote: pair.slice(idx + 1) }
}

// ── Position balance → Position ───────────────────────────────────────────

/**
 * Adapt one `position_balances[]` entry to a BrokeragePosition.
 *
 * Returns null for zero quantities and for the USD settlement entry
 * (cash, not a holding — it is captured by the account record).
 * Staked instruments (`SOL.staked`) become distinct positions on the
 * underlying token with the raw staked instrument kept in `identifier`.
 */
export function adaptPositionBalance(raw: CdcPositionBalance): BrokeragePosition | null {
  const quantity = num(raw.quantity)
  if (quantity <= 0) return null
  if (raw.instrument_name === 'USD') return null

  const isStaked = raw.instrument_name.endsWith(STAKED_SUFFIX)
  const token = isStaked ? raw.instrument_name.slice(0, -STAKED_SUFFIX.length) : raw.instrument_name

  return {
    id: `${raw.instrument_name}_CRYPTO_${SOURCE}`,
    source: SOURCE,
    symbol: token,
    name: isStaked ? `${token} (staked)` : undefined,
    secType: 'CRYPTO',
    currency: 'USD',
    quantity,
    // No cost basis from the API — filled in by the spot cost-basis engine
    avgCost: 0,
    marketValue: num(raw.market_value),
    identifier: isStaked ? raw.instrument_name : undefined,
    updatedAt: new Date().toISOString(),
  }
}

// ── User balance → Account ────────────────────────────────────────────────

/**
 * Adapt the unified-account balance to account records.
 *
 * The exchange has one USD-denominated unified wallet. Cash is taken from
 * the USD entry in position_balances when present (actual USD held);
 * `total_cash_balance` (Deposits − Withdrawals + Realized PnL − Fees) is
 * the documented fallback. Net liquidation = sum of all position market
 * values (the USD entry included), the closest equivalent to a
 * net-liquidation value for a unified collateral account.
 */
export function adaptUserBalance(raw: CdcUserBalance): BrokerageAccount {
  const balances = raw.position_balances ?? []
  const usdEntry = balances.find((b) => b.instrument_name === 'USD')
  const cashBalance = usdEntry ? num(usdEntry.market_value) : num(raw.total_cash_balance)

  const totalMarketValue = balances.reduce((sum, b) => sum + num(b.market_value), 0)
  const netLiquidation = balances.length > 0 ? totalMarketValue + (usdEntry ? 0 : cashBalance) : cashBalance

  return {
    id: `${SOURCE}_USD`,
    source: SOURCE,
    currency: 'USD',
    cashBalance,
    netLiquidation,
    updatedAt: new Date().toISOString(),
  }
}

// ── Trade → Transaction ───────────────────────────────────────────────────

/**
 * Adapt a fill from private/get-trades to a BrokerageTransaction.
 *
 * `id` uses the trade ID (fills are the atomic unit — one order can fill
 * many times); `orderId` keeps the parent order for grouping. Fees are
 * negative-when-charged and may be denominated in the base token — they
 * are normalized to the quote currency via the traded price.
 */
export function adaptTrade(raw: CdcTrade): BrokerageTransaction | null {
  if (!raw.trade_id) return null
  const quantity = num(raw.traded_quantity)
  if (quantity <= 0) return null

  const { base, quote } = splitInstrument(raw.instrument_name)
  const price = num(raw.traded_price)

  let commission: number | undefined
  const feeAmount = Math.abs(num(raw.fees))
  if (feeAmount > 0) {
    if (!raw.fee_instrument_name || raw.fee_instrument_name === quote) {
      commission = feeAmount
    } else if (raw.fee_instrument_name === base) {
      commission = feeAmount * price
    }
    // Fee in an unrelated token (e.g. CRO fee discount): not convertible
    // here — leave commission undefined rather than guess.
  }

  return {
    id: `${SOURCE}_${raw.trade_id}`,
    source: SOURCE,
    orderId: raw.order_id,
    symbol: raw.instrument_name,
    action: raw.side === 'SELL' ? 'SELL' : 'BUY',
    quantity,
    price,
    currency: quote || 'USD',
    commission,
    secType: 'CRYPTO',
    executedAt: new Date(raw.create_time).toISOString(),
  }
}

// ── Journal entry → Fund detail ───────────────────────────────────────────

/**
 * Static mapping of exchange `journal_type` values to `FundDetailType`.
 * SUBACCOUNT_TX is sign-dependent and handled separately.
 */
const JOURNAL_TYPE_MAP: Record<string, FundDetailType> = {
  TRADING: 'TRADE',
  TRADE_FEE: 'FEE',
  ONCHAIN_DEPOSIT: 'TRANSFER_IN',
  ONCHAIN_WITHDRAWAL: 'TRANSFER_OUT',
  AUTO_CONVERSION: 'CURRENCY_EXCHANGE',
  MANUAL_CONVERSION: 'CURRENCY_EXCHANGE',
  MARGIN_TRADE_INTEREST: 'FEE',
}

/** Track already-logged unknown journal types to avoid console spam */
const warnedJournalTypes = new Set<string>()

/**
 * Classify an exchange journal type into a FundDetailType.
 * `signedAmount` disambiguates direction-dependent types (SUBACCOUNT_TX).
 */
export function classifyJournalType(journalType: string | undefined, signedAmount: number): FundDetailType {
  if (!journalType) return 'UNKNOWN'

  const mapped = JOURNAL_TYPE_MAP[journalType]
  if (mapped) return mapped

  if (journalType === 'SUBACCOUNT_TX') {
    return signedAmount >= 0 ? 'TRANSFER_IN' : 'TRANSFER_OUT'
  }

  if (!warnedJournalTypes.has(journalType)) {
    warnedJournalTypes.add(journalType)
    console.warn(`[cdc-adapter] Unknown journal_type: "${journalType}" — classifying as UNKNOWN`)
  }
  return 'UNKNOWN'
}

/**
 * Adapt a journal entry from private/get-transactions to a fund detail.
 *
 * `transaction_cost` is the USD value of the movement; `transaction_qty`
 * is the instrument quantity. The USD cost is used as the ledger amount
 * (falling back to qty for entries with no cost), with the quantity kept
 * for the cost-basis engine.
 */
export function adaptJournalEntry(raw: CdcJournalEntry): BrokerageFundDetail | null {
  if (!raw.journal_id) return null
  if (!raw.event_timestamp_ms) return null

  const qty = num(raw.transaction_qty)
  const cost = num(raw.transaction_cost)
  const amount = cost !== 0 ? cost : qty
  const classifiedType = classifyJournalType(raw.journal_type, amount)

  const base = raw.instrument_name ? splitInstrument(raw.instrument_name).base : undefined
  const isTrade = classifiedType === 'TRADE'

  return {
    id: `${SOURCE}_fund_${raw.journal_id}`,
    source: SOURCE,
    rawType: raw.journal_type ?? 'UNKNOWN',
    classifiedType,
    symbol: base,
    contractName: raw.instrument_name,
    amount,
    currency: 'USD',
    action: isTrade && (raw.side === 'BUY' || raw.side === 'SELL') ? raw.side : undefined,
    quantity: qty !== 0 ? Math.abs(qty) : undefined,
    businessDate: new Date(raw.event_timestamp_ms).toISOString(),
  }
}

// ── Wallet deposit/withdrawal history → Fund detail ──────────────────────

/** Deposit status 1 = Arrived */
export function adaptDepositRecord(raw: CdcDepositRecord): BrokerageFundDetail | null {
  if (String(raw.status) !== '1') return null
  return adaptWalletRecord(raw, 'dep', num(raw.amount))
}

/** Withdrawal status 5 = Completed */
export function adaptWithdrawalRecord(raw: CdcWithdrawalRecord): BrokerageFundDetail | null {
  if (String(raw.status) !== '5') return null
  return adaptWalletRecord(raw, 'wd', -num(raw.amount))
}

function adaptWalletRecord(
  raw: CdcDepositRecord | CdcWithdrawalRecord,
  kind: 'dep' | 'wd',
  signedAmount: number
): BrokerageFundDetail | null {
  if (!raw.id || !raw.create_time) return null
  return {
    id: `${SOURCE}_fund_${kind}_${raw.id}`,
    source: SOURCE,
    rawType: kind === 'dep' ? 'DEPOSIT' : 'WITHDRAWAL',
    classifiedType: 'DEPOSIT_WITHDRAWAL',
    symbol: raw.currency,
    contractName: raw.txid ? `${raw.currency} (${raw.txid.slice(0, 12)}…)` : raw.currency,
    // Amount is in the deposited/withdrawn token's units (e.g. 0.5 BTC),
    // matching the journal's qty-denominated transfer entries.
    amount: signedAmount,
    currency: raw.currency,
    quantity: Math.abs(signedAmount),
    commission: raw.fee !== undefined ? num(raw.fee) : undefined,
    businessDate: new Date(raw.create_time).toISOString(),
  }
}

/**
 * Drop journal ONCHAIN_* transfer entries that duplicate a richer wallet
 * deposit/withdrawal record: same token, same calendar date, same absolute
 * quantity (0.1% tolerance).
 */
export function dedupeTransfers(
  journalDetails: BrokerageFundDetail[],
  walletDetails: BrokerageFundDetail[]
): BrokerageFundDetail[] {
  if (walletDetails.length === 0) return journalDetails

  const walletKeys = walletDetails.map((w) => ({
    symbol: w.symbol,
    date: w.businessDate.slice(0, 10),
    qty: Math.abs(w.quantity ?? w.amount),
  }))

  return journalDetails.filter((j) => {
    if (j.classifiedType !== 'TRANSFER_IN' && j.classifiedType !== 'TRANSFER_OUT') return true
    const jQty = Math.abs(j.quantity ?? j.amount)
    const jDate = j.businessDate.slice(0, 10)
    const isDupe = walletKeys.some(
      (w) => w.symbol === j.symbol && w.date === jDate && Math.abs(w.qty - jQty) <= jQty * 0.001
    )
    return !isDupe
  })
}

// ── Staking reward → Fund detail ──────────────────────────────────────────

/**
 * Adapt a staking reward event to a DIVIDEND fund detail (the crypto
 * income analogue). `usdPrice` is the underlying token's market price on
 * the event date (looked up by the provider); null when unavailable, in
 * which case the amount is 0 and the quantity still records the reward.
 */
export function adaptStakingReward(raw: CdcStakingReward, usdPrice: number | null): BrokerageFundDetail | null {
  const qty = num(raw.reward_quantity)
  const ts = num(raw.event_timestamp_ms)
  if (qty <= 0 || ts <= 0) return null

  const token = splitInstrument(raw.underlying_inst_name || raw.staking_inst_name).base.replace(STAKED_SUFFIX, '')

  return {
    // No native event id — derive a stable key from the event's content
    id: `${SOURCE}_fund_stk_${raw.staking_inst_name}_${ts}_${raw.reward_quantity}`,
    source: SOURCE,
    rawType: 'STAKING_REWARD',
    classifiedType: 'DIVIDEND',
    symbol: token,
    contractName: `${token} staking reward`,
    amount: usdPrice !== null ? qty * usdPrice : 0,
    currency: 'USD',
    quantity: qty,
    businessDate: new Date(ts).toISOString(),
  }
}

// ── Candles → K-line bars ─────────────────────────────────────────────────

export function adaptCandles(
  symbol: string,
  candles: CdcCandle[],
  period: BrokerageKlineBar['period']
): BrokerageKlineBar[] {
  return candles.map((c) => ({
    symbol,
    source: SOURCE,
    timestamp: num(c.t),
    open: num(c.o),
    high: num(c.h),
    low: num(c.l),
    close: num(c.c),
    volume: num(c.v),
    period,
  }))
}
