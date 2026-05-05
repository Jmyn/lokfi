/**
 * Normalized brokerage data model.
 *
 * All brokerages map into these unified types using a `source` discriminator
 * field for cross-provider analytics. Provider-specific fields go into the
 * extensions table (EAV pattern).
 */

/** Supported brokerage sources */
export type BrokerageSource = string

/** Asset class / security type */
export type SecurityType = 'STK' | 'OPT' | 'FUT' | 'FOP' | 'CASH' | 'FUND' | 'WAR' | 'MLEG'

/** Trade direction */
export type TradeAction = 'BUY' | 'SELL'

/** Fund detail classified type for unified view */
export type FundDetailType =
  | 'DIVIDEND'
  | 'DIVIDEND_TAX'
  | 'TRADE'
  | 'FEE'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'REBATE'
  | 'CURRENCY_EXCHANGE'
  | 'DEPOSIT_WITHDRAWAL'
  | 'UNKNOWN'

/** Sync status for audit trail */
export type SyncStatus = 'success' | 'failure' | 'in_progress'

/** Sync category discriminator */
export type SyncCategory = 'positions' | 'transactions' | 'fund_details' | 'account'

// ── Position ──────────────────────────────────────────────────────────────

export interface BrokeragePosition {
  /** Natural key: `${symbol}_${secType}_${source}` */
  id: string
  source: BrokerageSource
  symbol: string
  /** Display name (e.g. "Apple Inc.") */
  name?: string
  secType?: SecurityType
  currency: string
  quantity: number
  avgCost: number
  marketValue?: number
  unrealizedPnl?: number
  /** ISO-8601 timestamp of when this position was last fetched */
  updatedAt: string
  /** Option/derivative: OCC option symbol (e.g. "CRWV  260508P00106000") */
  identifier?: string
  /** Option/derivative: contract multiplier (e.g. 100 for standard US equity) */
  multiplier?: number
  /** Option/derivative: provider-internal contract ID */
  contractId?: number
}

/** EAV table for provider-specific position metadata */
export interface BrokeragePositionExtension {
  positionId: string
  key: string
  /** JSON-encoded value */
  value: string
}

// ── Transaction (order fill) ─────────────────────────────────────────────

export interface BrokerageTransaction {
  /** Provider-native order ID prefixed with source for global uniqueness */
  id: string
  source: BrokerageSource
  orderId: string
  symbol: string
  action: TradeAction
  quantity: number
  price: number
  currency: string
  commission?: number
  /** ISO-8601 timestamp of execution */
  executedAt: string
}

// ── Fund Detail ───────────────────────────────────────────────────────────

export interface BrokerageFundDetail {
  /** Natural key: provider-native record ID prefixed with source */
  id: string
  source: BrokerageSource
  /** Raw type string from the brokerage (e.g. "Commission", "Platform Fee") */
  rawType: string
  /** Classified type for the unified view */
  classifiedType: FundDetailType
  /** Extracted from desc for trades/dividends */
  symbol?: string
  /** Display name (e.g. "Broadcom") */
  contractName?: string
  amount: number
  currency: string
  /** Trade action (BUY/SELL) — only present when classifiedType is TRADE */
  action?: TradeAction
  /** Enriched from filled_orders — only present for TRADE records */
  quantity?: number
  price?: number
  commission?: number
  /** ISO-8601 business date */
  businessDate: string
  /** Segment type discriminator (e.g. 'SEC') */
  segType?: string
}

// ── Account ───────────────────────────────────────────────────────────────

export interface BrokerageAccount {
  /** Natural key: `${source}_${currency}` */
  id: string
  source: BrokerageSource
  currency: string
  /** Cash balance for this currency segment */
  cashBalance: number
  /** Net liquidation value for this segment */
  netLiquidation?: number
  /** Segment type discriminator (e.g. 'SEC' for securities, 'FUT' for futures) */
  segType?: string
  /** ISO-8601 timestamp of when this was last fetched */
  updatedAt: string
}

// ── Sync Log ──────────────────────────────────────────────────────────────

export interface BrokerageSyncLog {
  id?: number
  source: BrokerageSource
  category: SyncCategory
  status: SyncStatus
  /** ISO-8601 timestamp */
  lastSyncAt: string
  errorMessage?: string
}

// ── Credentials ───────────────────────────────────────────────────────────

/** Encrypted credential record stored in Dexie */
export interface BrokerageCredentials {
  /** Source name (e.g. 'tiger') */
  id: string
  /** AES-GCM encrypted JSON blob (base64) */
  encryptedData: string
  /** AES-GCM initialization vector (base64) */
  iv: string
  /** PBKDF2 salt used for key derivation (base64) */
  salt: string
}
