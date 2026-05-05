/**
 * @lokfi/brokerage-core
 *
 * Shared types and interfaces for the brokerage data pipeline.
 * Provider-agnostic — all brokerage integrations normalize into these types.
 */

// Types
export type {
  BrokerageAccount,
  BrokerageCredentials,
  BrokerageFundDetail,
  BrokeragePosition,
  BrokeragePositionExtension,
  BrokerageSource,
  BrokerageSyncLog,
  BrokerageTransaction,
  FundDetailType,
  SecurityType,
  SyncCategory,
  SyncStatus,
  TradeAction,
} from './types.js'

// Provider interface
export type { BrokerageProvider, BrokerageProviderConfig, ProviderProgress } from './provider.js'
