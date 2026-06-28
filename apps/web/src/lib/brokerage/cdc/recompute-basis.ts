/**
 * Recompute CDC cost basis from the locally stored ledger + overrides.
 *
 * Used after a manual opening-cost override edit so Holdings/Overview reflect
 * the new blended avgCost immediately. Builds a provider from stored
 * credentials for the candlestick price lookup (used to price transfers and
 * the earliest-activity estimate); falls back to a null lookup when no
 * credentials are present, so overrides still apply.
 */

import type { LokfiDatabase } from '../../db/db'
import { CredentialManager } from '../credential-manager'
import { DexieCredentialStore } from '../dexie-credential-store'
import { enrichCdcPositions } from './cdc-basis-enrichment'
import { CdcProvider } from './cdc-provider'

export async function recomputeCdcBasis(db: LokfiDatabase): Promise<void> {
  const credManager = new CredentialManager(new DexieCredentialStore(db))
  const stored = await credManager.retrieve('cdc')

  if (!stored?.apiKey || !stored?.apiSecret) {
    // No credentials → no price lookups available; overrides still apply.
    await enrichCdcPositions(db, async () => null)
    return
  }

  const provider = new CdcProvider({ config: { apiKey: stored.apiKey, apiSecret: stored.apiSecret } })
  await enrichCdcPositions(db, (token, date) => provider.getDailyClose(token, date))
}
