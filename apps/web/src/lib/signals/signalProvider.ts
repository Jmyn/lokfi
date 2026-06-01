import type { BrokerageProvider } from '@lokfi/brokerage-core'
import { CredentialManager, DexieCredentialStore, TigerProvider } from '../brokerage'
import type { TigerClientConfig } from '../brokerage'
import { db } from '../db/db'

const credManager = new CredentialManager(new DexieCredentialStore(db))
const SUPPORTS_HISTORICAL_BARS = new Set(['tiger'])

// Module-level cache
let cachedProvider: BrokerageProvider | null = null
let cachedCandidates: { source: string; supportsBars: boolean; error?: string }[] | null = null

// Listen for credential changes to invalidate cache
db.brokerageCredentials.hook('creating').subscribe(() => {
  cachedProvider = null
  cachedCandidates = null
})
db.brokerageCredentials.hook('updating').subscribe(() => {
  cachedProvider = null
  cachedCandidates = null
})
db.brokerageCredentials.hook('deleting').subscribe(() => {
  cachedProvider = null
  cachedCandidates = null
})

async function resolveProvider(): Promise<{
  provider: BrokerageProvider | null
  candidates: { source: string; supportsBars: boolean; error?: string }[]
}> {
  if (cachedProvider !== null && cachedCandidates !== null) {
    return { provider: cachedProvider, candidates: cachedCandidates }
  }

  const credentials = await db.brokerageCredentials.toArray()
  const candidates: { source: string; supportsBars: boolean; error?: string }[] = []

  // Sort: Tiger first, then alphabetical
  const sorted = [...credentials].sort((a, b) => {
    if (a.id === 'tiger') return -1
    if (b.id === 'tiger') return 1
    return a.id.localeCompare(b.id)
  })

  let resolved: BrokerageProvider | null = null

  for (const cred of sorted) {
    const source = cred.id
    const supportsBars = SUPPORTS_HISTORICAL_BARS.has(source)

    if (!supportsBars) {
      candidates.push({ source, supportsBars: false })
      continue
    }

    try {
      const plaintext = await credManager.retrieve(source)
      if (!plaintext) {
        candidates.push({ source, supportsBars: true, error: 'Could not decrypt credentials' })
        continue
      }

      let provider: BrokerageProvider
      if (source === 'tiger') {
        const config: TigerClientConfig = {
          tigerId: plaintext.tigerId,
          privateKey: plaintext.privateKey,
          account: plaintext.account,
        }
        provider = new TigerProvider({ config })
      } else {
        candidates.push({ source, supportsBars: true, error: 'No provider implementation' })
        continue
      }

      if (!resolved) {
        resolved = provider
      }
      candidates.push({ source, supportsBars: true })
    } catch (err) {
      candidates.push({ source, supportsBars: true, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  cachedProvider = resolved
  cachedCandidates = candidates

  return { provider: resolved, candidates }
}

/**
 * Resolve the first available brokerage provider that supports `fetchHistoricalBars`.
 * Returns `null` if none qualify (e.g. no credentials, all stubs).
 * Results are cached until credentials change.
 */
export async function getSignalProvider(): Promise<BrokerageProvider | null> {
  const { provider } = await resolveProvider()
  return provider
}

/**
 * Resolve the first available provider and return all candidates for introspection.
 * The UI uses this to show "Signal source: Tiger (you have 2 connected brokers)".
 */
export async function getSignalProviderWithFallback(): Promise<{
  provider: BrokerageProvider | null
  allCandidates: { source: string; supportsBars: boolean; error?: string }[]
}> {
  const { provider, candidates } = await resolveProvider()
  return { provider, allCandidates: candidates }
}

/**
 * Invalidate the cached provider. Useful when the user changes credentials.
 */
export function invalidateSignalProvider(): void {
  cachedProvider = null
  cachedCandidates = null
}
