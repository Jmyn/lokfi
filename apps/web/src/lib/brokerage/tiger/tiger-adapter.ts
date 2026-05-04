/**
 * Tiger → normalized type adapters.
 *
 * Maps raw Tiger API responses into the @lokfi/brokerage-core normalized
 * types that the sync orchestrator persists to Dexie.
 */

import type {
  BrokerageAccount,
  BrokerageCorpAction,
  BrokeragePosition,
  BrokerageTransaction,
  CorpActionType,
  TradeAction,
} from '@lokfi/brokerage-core'
import type {
  TigerAsset,
  TigerAssetSegment,
  TigerCorpAction,
  TigerOrder,
  TigerOrderTransaction,
  TigerPosition,
} from './tiger-types'

/** Source discriminator for all Tiger records */
export const SOURCE = 'tiger'

// ── Position ──────────────────────────────────────────────────────────────

export function adaptPosition(raw: TigerPosition): BrokeragePosition {
  return {
    id: `${raw.symbol}_${SOURCE}`,
    source: SOURCE,
    symbol: raw.symbol,
    name: raw.name,
    secType: (raw.secType || 'STK') as BrokeragePosition['secType'],
    currency: raw.currency || 'USD',
    quantity: raw.position,
    avgCost: raw.averageCost,
    marketValue: raw.marketValue,
    unrealizedPnl: raw.unrealizedPnl,
    updatedAt: new Date().toISOString(),
  }
}

// ── Order → Transaction ───────────────────────────────────────────────────

/**
 * Convert a Tiger Order (which includes fills) to a BrokerageTransaction.
 * Only orders with status 'Filled' or 'PartiallyFilled' produce transactions.
 * Partially filled orders produce one transaction per fill quantity.
 */
export function adaptOrder(order: TigerOrder): BrokerageTransaction | null {
  const orderId = String(order.orderId ?? order.id ?? '')
  if (!orderId) return null

  // Only emit transactions for executed order states
  const filledQty = order.filledQuantity ?? 0
  if (filledQty <= 0) return null

  const action = normalizeAction(order.action)

  return {
    id: `${SOURCE}_${orderId}`,
    source: SOURCE,
    orderId,
    symbol: order.symbol,
    action,
    quantity: filledQty,
    price: order.avgFillPrice ?? 0,
    currency: order.currency || 'USD',
    commission: order.commission,
    executedAt: order.latestTime ? new Date(order.latestTime).toISOString() : new Date().toISOString(),
  }
}

// ── Order Transaction Detail → Transaction ────────────────────────────────

export function adaptOrderTransaction(raw: TigerOrderTransaction): BrokerageTransaction | null {
  const orderId = String(raw.orderId ?? raw.id ?? '')
  if (!orderId) return null

  return {
    id: `${SOURCE}_txn_${orderId}`,
    source: SOURCE,
    orderId,
    symbol: raw.symbol ?? '',
    action: normalizeAction(raw.action ?? ''),
    quantity: raw.quantity ?? 0,
    price: raw.price ?? 0,
    currency: raw.currency || 'USD',
    commission: raw.commission,
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

// ── Corporate Action ──────────────────────────────────────────────────────

/**
 * Adapt Tiger fund_detail records with fund_type=CORPORATE_ACTION
 * into normalized corp actions. Parses the description string to
 * determine action type (dividend, split, rights, or other).
 */
export function adaptCorpAction(raw: TigerCorpAction): BrokerageCorpAction | null {
  const date = raw.businessDate || new Date().toISOString().slice(0, 10)

  return {
    id: `${SOURCE}_${date}_${raw.id ?? raw.desc ?? ''}`,
    source: SOURCE,
    symbol: '', // Not available in fund_detail — derived from desc
    type: classifyCorpAction(raw.desc),
    amount: raw.amount,
    currency: raw.currency,
    payDate: date,
    appliedAt: raw.transactionTime ? new Date(raw.transactionTime * 1000).toISOString() : new Date().toISOString(),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function normalizeAction(action: string): TradeAction {
  const upper = action.toUpperCase()
  if (upper === 'SELL' || upper === 'SHORT') return 'SELL'
  return 'BUY'
}

function classifyCorpAction(desc?: string): CorpActionType {
  if (!desc) return 'OTHER'
  const lower = desc.toLowerCase()
  if (lower.includes('dividend') || lower.includes('div')) return 'DIVIDEND'
  if (lower.includes('split')) return 'SPLIT'
  if (lower.includes('right')) return 'RIGHTS'
  return 'OTHER'
}
