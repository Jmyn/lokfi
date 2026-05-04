/**
 * @lokfi/brokerage-core
 *
 * Shared types and interfaces for the brokerage data pipeline.
 * Provider-agnostic — all brokerage integrations normalize into these types.
 */

// Types
export type {
  BrokerageAccount,
  BrokerageCorpAction,
  BrokerageCredentials,
  BrokeragePosition,
  BrokeragePositionExtension,
  BrokerageSource,
  BrokerageSyncLog,
  BrokerageTransaction,
  CorpActionType,
  SecurityType,
  SyncCategory,
  SyncStatus,
  TradeAction,
} from './types.js'

// Provider interface
export type { BrokerageProvider, BrokerageProviderConfig } from './provider.js'
