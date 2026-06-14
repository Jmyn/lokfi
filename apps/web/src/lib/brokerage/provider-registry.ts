/**
 * Provider registry — maps a brokerage source id + decrypted credentials
 * to a concrete BrokerageProvider instance.
 *
 * Add new integrations here; pages and the signal provider resolve
 * providers through this factory instead of hardcoding constructors.
 */

import type { BrokerageProvider } from '@lokfi/brokerage-core'
import { CdcProvider } from './cdc/cdc-provider'
import { TigerProvider } from './tiger/tiger-provider'
import type { TigerClientConfig } from './tiger/tiger-types'

/** Sources with a real provider implementation, in display/sync order */
export const CONFIGURED_SOURCES = ['tiger', 'cdc'] as const

export type ConfiguredSource = (typeof CONFIGURED_SOURCES)[number]

/**
 * Build a provider for a source from its decrypted credential record.
 * Returns null for unknown sources or credential records missing
 * required fields.
 */
export function createBrokerageProvider(source: string, credentials: Record<string, string>): BrokerageProvider | null {
  switch (source) {
    case 'tiger': {
      if (!credentials.tigerId || !credentials.privateKey || !credentials.account) return null
      const config: TigerClientConfig = {
        tigerId: credentials.tigerId,
        privateKey: credentials.privateKey,
        account: credentials.account,
      }
      return new TigerProvider({ config })
    }
    case 'cdc': {
      if (!credentials.apiKey || !credentials.apiSecret) return null
      return new CdcProvider({ config: { apiKey: credentials.apiKey, apiSecret: credentials.apiSecret } })
    }
    default:
      return null
  }
}
