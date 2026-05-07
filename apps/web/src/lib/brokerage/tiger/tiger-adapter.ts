/**
 * Tiger → normalized type adapters.
 *
 * Maps raw Tiger API responses into the @lokfi/brokerage-core normalized
 * types that the sync orchestrator persists to Dexie.
 */

import type {
  BrokerageAccount,
  BrokerageFundDetail,
  BrokeragePosition,
  BrokerageTransaction,
  FundDetailType,
  TradeAction,
} from '@lokfi/brokerage-core'
import type {
  TigerAsset,
  TigerAssetSegment,
  TigerFundDetail,
  TigerOrder,
  TigerOrderTransaction,
  TigerPosition,
} from './tiger-types'

/** Source discriminator for all Tiger records */
export const SOURCE = 'tiger'

// ── Position ──────────────────────────────────────────────────────────────

export function adaptPosition(raw: TigerPosition): BrokeragePosition {
  const secType = (raw.secType || 'STK') as BrokeragePosition['secType']
  // For derivatives, include the OCC identifier in the ID to disambiguate
  // multiple contracts on the same underlying (e.g. GRAB OPT $4 vs $4.50).
  const id = raw.identifier
    ? `${raw.secType}_${raw.identifier.replace(/\s+/g, '_')}_${SOURCE}`
    : `${raw.symbol}_${secType}_${SOURCE}`
  return {
    id,
    source: SOURCE,
    symbol: raw.symbol,
    name: raw.name,
    secType,
    currency: raw.currency || 'USD',
    quantity: raw.position,
    avgCost: raw.averageCost,
    marketValue: raw.marketValue,
    unrealizedPnl: raw.unrealizedPnl,
    // Option/derivative fields (only present for OPT, FUT, etc.)
    identifier: raw.identifier,
    multiplier: raw.multiplier,
    contractId: raw.contractId,
    updatedAt: new Date().toISOString(),
  }
}

// ── Order → Transaction ───────────────────────────────────────────────────

/**
 * Convert a Tiger Order (which includes fills) to a BrokerageTransaction.
 *
 * Uses `order.id` as the unique identifier because Tiger's `orderId` field
 * is always 0 for certain account types (notably global/prime accounts),
 * causing all orders to collide on key `tiger_0` in the DB.
 *
 * Only orders with filledQuantity > 0 produce transactions.
 */
export function adaptOrder(order: TigerOrder): BrokerageTransaction | null {
  // Use the unique record ID (order.id) as the primary identifier.
  // order.orderId may be 0 for some account types — skip it as unique key.
  const rawId = order.id ?? order.orderId
  if (rawId === undefined || rawId === null) return null
  const id = String(rawId)
  if (!id || id === '0') return null

  // Only emit transactions for executed order states
  const filledQty = order.filledQuantity ?? 0
  if (filledQty <= 0) return null

  const action = normalizeAction(order.action)

  return {
    id: `${SOURCE}_${id}`,
    source: SOURCE,
    orderId: id,
    symbol: order.symbol,
    action,
    quantity: filledQty,
    price: order.avgFillPrice ?? 0,
    currency: order.currency || 'USD',
    commission: order.commission,
    secType: order.secType as BrokerageTransaction['secType'],
    executedAt: order.latestTime ? new Date(order.latestTime).toISOString() : new Date().toISOString(),
  }
}

// ── Order Transaction Detail → Transaction ────────────────────────────────

export function adaptOrderTransaction(raw: TigerOrderTransaction): BrokerageTransaction | null {
  // Use the unique record ID first; orderId may be 0 for some account types.
  const rawId = raw.id ?? raw.orderId
  if (rawId === undefined || rawId === null) return null
  const id = String(rawId)
  if (!id || id === '0') return null

  return {
    id: `${SOURCE}_txn_${id}`,
    source: SOURCE,
    orderId: id,
    symbol: raw.symbol ?? '',
    action: normalizeAction(raw.action ?? ''),
    quantity: raw.quantity ?? 0,
    price: raw.price ?? 0,
    currency: raw.currency || 'USD',
    commission: raw.commission,
    secType: raw.secType as BrokerageTransaction['secType'],
    executedAt: raw.tradeTime ? new Date(raw.tradeTime).toISOString() : new Date().toISOString(),
  }
}

// ── Asset → Account ───────────────────────────────────────────────────────

export function adaptAsset(raw: TigerAsset): BrokerageAccount {
  return {
    id: `${SOURCE}_${raw.currency}`,
    source: SOURCE,
    currency: raw.currency,
    cashBalance: raw.cashValue ?? 0,
    netLiquidation: raw.netLiquidation,
    segType: undefined,
    updatedAt: new Date().toISOString(),
  }
}

/** Adapt a segment from the assets response into an account record */
export function adaptAssetSegment(segment: TigerAssetSegment, currency: string): BrokerageAccount {
  return {
    id: `${SOURCE}_${currency}_${segment.category}`,
    source: SOURCE,
    currency,
    cashBalance: segment.cashValue ?? 0,
    netLiquidation: segment.netLiquidation,
    segType: segment.category === 'S' ? 'SEC' : segment.category === 'C' ? 'FUT' : segment.category,
    updatedAt: new Date().toISOString(),
  }
}

// ── Fund Detail → BrokerageFundDetail ─────────────────────────────────────

/**
 * Static mapping of Tiger fund_detail `type` strings to `FundDetailType`.
 * Exact-match map — entries here take priority over prefix/pattern matching.
 */
const FUND_TYPE_MAP: Record<string, FundDetailType> = {
  Dividend: 'DIVIDEND',
  'Dividend Tax': 'DIVIDEND_TAX',
  Trade: 'TRADE',
  Commission: 'FEE',
  'Platform Fee': 'FEE',
  'Settlement Fee': 'FEE',
  GST: 'FEE',
  'Trading Activity Fee': 'FEE',
  'SEC Fee': 'FEE',
  'Option Regulatory Fee': 'FEE',
  'Clearing Fee': 'FEE',
  'Funds Transfer In': 'TRANSFER_IN',
  'Funds Transfer Out': 'TRANSFER_OUT',
  'Campaign Subsidy': 'REBATE',
  Deposit: 'DEPOSIT_WITHDRAWAL',
}

/** Track already-logged unknown types to avoid console spam on repeated syncs */
const warnedTypes = new Set<string>()

/**
 * Classify a Tiger fund_detail `type` string into a FundDetailType.
 *
 * Matching order:
 *   1. Exact match in FUND_TYPE_MAP (fast path)
 *   2. Prefix / regex pattern match (handles variants)
 *   3. Fallback to `UNKNOWN` with a one-time warning per type
 */
export function classifyFundType(rawType?: string): FundDetailType {
  if (!rawType) return 'UNKNOWN'

  // 1. Exact match
  const mapped = FUND_TYPE_MAP[rawType]
  if (mapped) return mapped

  // 2. Prefix / pattern matches
  if (rawType.startsWith('Currency Exchange')) return 'CURRENCY_EXCHANGE'
  if (/^(Deposit|Withdrawal)/i.test(rawType)) return 'DEPOSIT_WITHDRAWAL'

  // 3. Unknown — log once per type, classify as UNKNOWN
  if (!warnedTypes.has(rawType)) {
    warnedTypes.add(rawType)
    console.warn(`[tiger-adapter] Unknown fund_detail type: "${rawType}" — classifying as UNKNOWN`)
  }
  return 'UNKNOWN'
}

/**
 * Extract the stock symbol from a fund detail description.
 * Descriptions follow the pattern "Action-SYMBOL" (e.g. "Buy-AVGO")
 * or "SYMBOL-DIVIDEND" (e.g. "XDTE-DIVIDEND").
 */
export function extractSymbolFromDesc(desc?: string): string {
  if (!desc) return ''
  // Try "Buy-AVGO" pattern first (prefix-action)
  const actionMatch = desc.trim().match(/^(?:Buy|Sell)-(\S+)/i)
  if (actionMatch) return actionMatch[1].toUpperCase()
  // Fall back to first segment split by '-' (e.g. "XDTE-DIVIDEND" → "XDTE")
  const segments = desc.trim().split('-')
  return segments[0] ? segments[0].toUpperCase() : ''
}

/**
 * Extract trade action (Buy/Sell) from a fund detail description.
 * Returns undefined if the description does not start with a recognised prefix.
 */
export function extractActionFromDesc(desc?: string): TradeAction | undefined {
  if (!desc) return undefined
  const match = desc.trim().match(/^(Buy|Sell)/i)
  if (!match) return undefined
  const upper = match[1].toUpperCase()
  if (upper === 'SELL') return 'SELL'
  return 'BUY'
}

/**
 * Adapt a raw TigerFundDetail record into a normalized BrokerageFundDetail.
 * Returns null if the record is unparseable (no id, no business date).
 */
export function adaptFundDetail(raw: TigerFundDetail): BrokerageFundDetail | null {
  if (raw.id === undefined || raw.id === null) return null
  if (!raw.businessDate) return null

  const classifiedType = classifyFundType(raw.type)
  const symbol = extractSymbolFromDesc(raw.desc)
  const action = classifyFundType(raw.type) === 'TRADE' ? extractActionFromDesc(raw.desc) : undefined

  return {
    id: `${SOURCE}_fund_${raw.id}`,
    source: SOURCE,
    rawType: raw.type ?? 'UNKNOWN',
    classifiedType,
    symbol: symbol || undefined,
    contractName: raw.contractName,
    amount: raw.amount ?? 0,
    currency: raw.currency || 'USD',
    action,
    quantity: undefined,
    price: undefined,
    commission: undefined,
    businessDate: raw.businessDate,
    segType: raw.segType,
  }
}

// ── Trade Enrichment ──────────────────────────────────────────────────────

/**
 * Enrich a TRADE fund_detail record with quantity, price, and commission
 * from matching filled orders.
 *
 * Matching strategy (most → least reliable):
 * 1. Match by symbol + date + action (single match → use it)
 * 2. Multiple matches → select closest amount match
 * 3. No match → return unenriched
 */
export function enrichTradeFundDetail(
  fd: BrokerageFundDetail,
  filledOrders: BrokerageTransaction[]
): BrokerageFundDetail {
  if (fd.classifiedType !== 'TRADE') return fd
  if (!fd.symbol || !fd.action) return fd

  const fdDate = fd.businessDate.slice(0, 10)

  // Find filled orders matching symbol + date + action
  const matches = filledOrders.filter((o) => {
    const oDate = o.executedAt.slice(0, 10)
    return o.symbol === fd.symbol && oDate === fdDate && o.action === fd.action
  })

  if (matches.length === 0) {
    console.debug(`[tiger-adapter] Unmatched trade fund detail: ${fd.symbol} ${fd.action} on ${fdDate}`)
    return fd
  }

  // Single match — use it directly
  if (matches.length === 1) {
    const order = matches[0]
    return {
      ...fd,
      quantity: order.quantity,
      price: order.price,
      commission: order.commission,
    }
  }

  // Multiple matches — select closest amount match
  const fdAbsAmount = Math.abs(fd.amount)
  let bestMatch = matches[0]
  let bestDiff = Math.abs(Math.abs(orderGrossAmount(matches[0])) - fdAbsAmount)

  for (let i = 1; i < matches.length; i++) {
    const diff = Math.abs(Math.abs(orderGrossAmount(matches[i])) - fdAbsAmount)
    if (diff < bestDiff) {
      bestDiff = diff
      bestMatch = matches[i]
    }
  }

  return {
    ...fd,
    quantity: bestMatch.quantity,
    price: bestMatch.price,
    commission: bestMatch.commission,
  }
}

function orderGrossAmount(order: BrokerageTransaction): number {
  return order.quantity * order.price + (order.commission ?? 0)
}

// ── Helpers ───────────────────────────────────────────────────────────────

function normalizeAction(action: string): TradeAction {
  const upper = action.toUpperCase()
  if (upper === 'SELL' || upper === 'SHORT') return 'SELL'
  return 'BUY'
}
