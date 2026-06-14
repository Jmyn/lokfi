/**
 * Brokerage module barrel export.
 *
 * Public API for the brokerage data pipeline:
 *   - SyncOrchestrator: coordinates multi-category sync with retry + throttle
 *   - TigerProvider: Tiger Brokers OpenAPI integration
 *   - CdcProvider: Crypto.com Exchange integration
 *   - CredentialManager: encrypted credential storage
 *   - DexieSyncAdapter, DexieCredentialStore: Dexie-backed adapters
 */

export { TigerProvider } from './tiger/tiger-provider'
export type { TigerProviderOptions } from './tiger/tiger-provider'

export { CdcProvider } from './cdc/cdc-provider'
export type { CdcProviderOptions } from './cdc/cdc-provider'
export { CdcHttpClient, CdcHttpError, CdcAuthError, CdcRateLimitError } from './cdc/cdc-http-client'
export type { CdcClientConfig } from './cdc/cdc-types'
export { enrichCdcPositions, computeCdcBasisEnrichment } from './cdc/cdc-basis-enrichment'
export {
  BASIS_QUALITY_EXT_KEY,
  BASIS_DIAGNOSTICS_EXT_KEY,
  REALIZED_PNL_EXT_KEY,
} from './cdc/cdc-basis-enrichment'
export { createBrokerageProvider, CONFIGURED_SOURCES } from './provider-registry'

export { TigerHttpClient, TigerHttpError, TigerAuthError } from './tiger/tiger-http-client'

export type { TigerClientConfig } from './tiger/tiger-types'
export type {
  TigerPosition,
  TigerOrder,
  TigerOrderTransaction,
  TigerAsset,
  TigerFundDetail,
  TigerApiRequest,
  TigerApiResponse,
  TigerMarket,
  TigerSecType,
  TigerCurrency,
  TigerOrderStatus,
} from './tiger/tiger-types'

export { CredentialManager } from './credential-manager'
export type { CredentialStore } from './credential-manager'

export { computeIncrementalSince, SyncOrchestrator } from './sync-orchestrator'
export type { SyncOrchestratorOptions, SyncDatabase, SyncProgress, SyncCategoryOverrides } from './sync-orchestrator'

export { DexieSyncAdapter } from './dexie-sync-adapter'
export { DexieCredentialStore } from './dexie-credential-store'
