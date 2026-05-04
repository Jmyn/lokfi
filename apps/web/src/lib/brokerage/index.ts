/**
 * Brokerage module barrel export.
 *
 * Public API for the brokerage data pipeline:
 *   - SyncOrchestrator: coordinates multi-category sync with retry + throttle
 *   - TigerProvider: Tiger Brokers OpenAPI integration
 *   - CdcStubProvider: Crypto.com stub provider
 *   - CredentialManager: encrypted credential storage
 *   - DexieSyncAdapter, DexieCredentialStore: Dexie-backed adapters
 */

export { TigerProvider } from './tiger/tiger-provider'
export type { TigerProviderOptions } from './tiger/tiger-provider'

export { CdcStubProvider } from './cdc/cdc-stub'

export { TigerHttpClient, TigerHttpError, TigerAuthError } from './tiger/tiger-http-client'

export type { TigerClientConfig } from './tiger/tiger-types'
export type {
  TigerPosition,
  TigerOrder,
  TigerOrderTransaction,
  TigerAsset,
  TigerCorpAction,
  TigerApiRequest,
  TigerApiResponse,
  TigerMarket,
  TigerSecType,
  TigerCurrency,
  TigerOrderStatus,
} from './tiger/tiger-types'

export { CredentialManager } from './credential-manager'
export type { CredentialStore } from './credential-manager'

export { SyncOrchestrator } from './sync-orchestrator'
export type { SyncOrchestratorOptions, SyncDatabase } from './sync-orchestrator'

export { DexieSyncAdapter } from './dexie-sync-adapter'
export { DexieCredentialStore } from './dexie-credential-store'
