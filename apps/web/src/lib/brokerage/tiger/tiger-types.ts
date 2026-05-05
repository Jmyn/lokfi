/**
 * Tiger OpenAPI type definitions — mirrors the internal types from the
 * @tigeropenapi/tigeropen SDK (src/model/*) since the SDK's compiled
 * declarations don't export model types and it's Node.js-only anyway.
 */

// ── Enums ─────────────────────────────────────────────────────────────────

export const TigerMarket = {
  US: 'US',
  HK: 'HK',
  CN: 'CN',
  SG: 'SG',
} as const
export type TigerMarket = (typeof TigerMarket)[keyof typeof TigerMarket]

export const TigerSecType = {
  STK: 'STK',
  OPT: 'OPT',
  FUT: 'FUT',
  FOP: 'FOP',
  CASH: 'CASH',
  FUND: 'FUND',
  WAR: 'WAR',
  MLEG: 'MLEG',
} as const
export type TigerSecType = (typeof TigerSecType)[keyof typeof TigerSecType]

export const TigerCurrency = {
  USD: 'USD',
  HKD: 'HKD',
  CNH: 'CNH',
  SGD: 'SGD',
} as const
export type TigerCurrency = (typeof TigerCurrency)[keyof typeof TigerCurrency]

export const TigerOrderStatus = {
  Submitted: 'Submitted',
  PartiallyFilled: 'PartiallyFilled',
  Filled: 'Filled',
  Cancelled: 'Cancelled',
  Inactive: 'Inactive',
} as const
export type TigerOrderStatus = (typeof TigerOrderStatus)[keyof typeof TigerOrderStatus]

// ── API Request / Response ────────────────────────────────────────────────

export interface TigerApiRequest {
  method: string
  bizContent: string
  version?: string
}

export interface TigerApiResponse<T = unknown> {
  code: number
  message: string
  data: T
  timestamp: number
  sign?: string
}

// ── Position ──────────────────────────────────────────────────────────────

export interface TigerPosition {
  account: string
  symbol: string
  secType: string
  market?: string
  currency?: string
  /** Current position quantity */
  position: number
  positionScale?: number
  positionQty?: number
  salableQty?: number
  averageCost: number
  averageCostByAverage?: number
  marketValue?: number
  realizedPnl?: number
  unrealizedPnl?: number
  unrealizedPnlByAverage?: number
  unrealizedPnlPercent?: number
  contractId?: number
  identifier?: string
  name?: string
  latestPrice?: number
  multiplier?: number
}

// ── Order ─────────────────────────────────────────────────────────────────

export interface TigerOrder {
  account: string
  id?: number
  orderId?: number
  action: string
  orderType: string
  totalQuantity: number
  limitPrice?: number
  status?: string
  filledQuantity?: number
  avgFillPrice?: number
  timeInForce: string
  outsideRth: boolean
  symbol: string
  secType: string
  market?: string
  currency?: string
  identifier?: string
  name?: string
  commission?: number
  realizedPnl?: number
  openTime?: number
  updateTime?: number
  latestTime?: number
  remark?: string
}

// ── Transaction (order fill detail) ───────────────────────────────────────

export interface TigerOrderTransaction {
  account: string
  id?: number
  orderId?: number
  symbol?: string
  secType?: string
  action?: string
  quantity?: number
  price?: number
  currency?: string
  commission?: number
  tradeTime?: number
}

// ── Asset ─────────────────────────────────────────────────────────────────

/** Per-currency-segment account asset data */
export interface TigerAsset {
  account: string
  currency: string
  capability?: string
  /** Cash value (securities segment) / available funds */
  cashValue?: number
  /** Net liquidation value */
  netLiquidation?: number
  /** Buying power */
  buyingPower?: number
  /** Realized P&L */
  realizedPnL?: number
  /** Unrealized P&L */
  unrealizedPnL?: number
  /** Segment details */
  segments?: TigerAssetSegment[]
}

export interface TigerAssetSegment {
  account: string
  /** 'S' = securities, 'C' = commodities/futures */
  category: string
  title?: string
  netLiquidation?: number
  cashValue?: number
  availableFunds?: number
  equityWithLoan?: number
  excessLiquidity?: number
  accruedCash?: number
  accruedDividend?: number
  initMarginReq?: number
  maintMarginReq?: number
  buyingPower?: number
}

// TigerCorpAction removed — superseded by TigerFundDetail (see below)

// ── Fund Detail (fund_detail with fund_type=ALL) ──────────────────────────

export interface TigerFundDetail {
  /** Fund change record ID */
  id?: number
  account: string
  currency?: string
  amount?: number
  /** Description (e.g. "Buy-AVGO", "XDTE-DIVIDEND", "Funds Transfer In") */
  desc?: string
  /** Fund type string (e.g. "Trade", "Commission", "Dividend", "Dividend Tax") */
  type?: string
  /** Contract/company display name */
  contractName?: string
  /** Segment type (e.g. 'SEC') */
  segType?: string
  /** Business date (ISO-8601 date string) */
  businessDate?: string
  /** Last update timestamp (epoch seconds) */
  updatedAt?: number
  /** Transaction timestamp (epoch seconds) */
  transactionTime?: number
}

// ── Client Config ─────────────────────────────────────────────────────────

export interface TigerClientConfig {
  tigerId: string
  privateKey: string
  account: string
  language?: string
  serverUrl?: string
}
