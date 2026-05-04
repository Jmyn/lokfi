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

/** Corporate action type */
export type CorpActionType = 'DIVIDEND' | 'SPLIT' | 'RIGHTS' | 'OTHER'

/** Sync status for audit trail */
export type SyncStatus = 'success' | 'failure' | 'in_progress'

/** Sync category discriminator */
export type SyncCategory = 'positions' | 'transactions' | 'corp_actions' | 'account'

// ── Position ──────────────────────────────────────────────────────────────

export interface BrokeragePosition {
  /** Natural key: `${symbol}_${source}` */
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

// ── Corporate Action ─────────────────────────────────────────────────────

export interface BrokerageCorpAction {
  /** Natural key: `${source}_${symbol}_${type}_${payDate || exDate}` */
  id: string
  source: BrokerageSource
  symbol: string
  type: CorpActionType
  amount?: number
  currency?: string
  /** ISO-8601 ex-dividend date */
  exDate?: string
  /** ISO-8601 payment date */
  payDate?: string
  /** ISO-8601 when this was applied to the account */
  appliedAt: string
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
