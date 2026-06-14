/**
 * Crypto.com Exchange connection section for the brokerage settings page.
 *
 * Mirrors the Tiger flow: save encrypted API key/secret (credential id
 * 'cdc'), test the connection, trigger a full resync, disconnect. All
 * destructive operations are scoped to source 'cdc'.
 */

import type { BrokerageSyncLog } from '@lokfi/brokerage-core'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertCircle, CheckCircle, Loader2, RefreshCw, Unlink } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  CdcAuthError,
  CdcProvider,
  CredentialManager,
  DexieCredentialStore,
  DexieSyncAdapter,
  SyncOrchestrator,
  enrichCdcPositions,
} from '../../lib/brokerage'
import { SyncProgressBar } from '../../lib/brokerage/SyncProgressBar'
import { clearBrokerageSourceData } from '../../lib/brokerage/source-data'
import type { SyncProgress } from '../../lib/brokerage/sync-orchestrator'
import { db } from '../../lib/db/db'

const SOURCE = 'cdc'

export function CdcSettingsSection() {
  const [credentials, setCredentials] = useState({ apiKey: '', apiSecret: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [hasCredentials, setHasCredentials] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [syncProgress, setSyncProgress] = useState<SyncProgress[]>([])

  const credManager = useMemo(() => new CredentialManager(new DexieCredentialStore(db)), [])

  const syncLogs = useLiveQuery(() => db.brokerageSyncLog.where('source').equals(SOURCE).reverse().toArray(), [])

  useEffect(() => {
    credManager.hasCredentials(SOURCE).then(setHasCredentials)
  }, [credManager])

  function showError(msg: string) {
    setError(msg)
    setTimeout(() => setError(null), 8000)
  }

  function showSuccess(msg: string) {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 5000)
  }

  async function ensureSaved(): Promise<boolean> {
    if (hasCredentials) return true
    if (!credentials.apiKey || !credentials.apiSecret) {
      showError('Please fill in the API key and secret first')
      return false
    }
    try {
      await credManager.store(SOURCE, credentials)
      setHasCredentials(true)
      return true
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save credentials')
      return false
    }
  }

  async function buildProvider(): Promise<CdcProvider | null> {
    const stored = await credManager.retrieve(SOURCE)
    if (!stored?.apiKey || !stored?.apiSecret) {
      showError('No credentials found')
      return null
    }
    return new CdcProvider({ config: { apiKey: stored.apiKey, apiSecret: stored.apiSecret } })
  }

  async function handleSave() {
    setLoading(true)
    setError(null)
    try {
      if (await ensureSaved()) showSuccess('Credentials saved')
    } finally {
      setLoading(false)
    }
  }

  async function handleTest() {
    if (!(await ensureSaved())) return
    setTesting(true)
    setError(null)
    try {
      const provider = await buildProvider()
      if (!provider) return
      // fetchAccount instead of validateConnection so credential failures
      // surface with their specific cause rather than a generic boolean.
      await provider.fetchAccount()
      showSuccess('Connection successful')
    } catch (err) {
      if (err instanceof CdcAuthError) {
        showError(`API key rejected: ${err.message}. Check the key, secret, and IP whitelist on the exchange.`)
      } else {
        showError(err instanceof Error ? err.message : 'Connection test failed')
      }
    } finally {
      setTesting(false)
    }
  }

  async function handleSync() {
    if (!(await ensureSaved())) return
    setSyncing(true)
    setError(null)
    setSyncProgress([])
    try {
      const provider = await buildProvider()
      if (!provider) return
      const adapter = new DexieSyncAdapter(db)
      const orchestrator = new SyncOrchestrator({
        provider,
        database: adapter,
        onProgress: (p) => setSyncProgress((prev) => [...prev, p]),
      })

      // Full resync: clear CDC data, then sync from the API's full
      // retention window (the orchestrator clamps to maxLookbackDays).
      await clearBrokerageSourceData(db, SOURCE)
      await orchestrator.sync()
      await enrichCdcPositions(db, (token, date) => provider.getDailyClose(token, date))
      showSuccess('Sync completed')
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect Crypto.com Exchange? This will remove its synced data (other brokerages are unaffected).'))
      return
    setLoading(true)
    try {
      await credManager.remove(SOURCE)
      await clearBrokerageSourceData(db, SOURCE)
      await db.brokerageSyncLog.where('source').equals(SOURCE).delete()
      setHasCredentials(false)
      setCredentials({ apiKey: '', apiSecret: '' })
      showSuccess('Disconnected')
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Disconnect failed')
    } finally {
      setLoading(false)
    }
  }

  const lastSyncByCategory = new Map<string, BrokerageSyncLog>()
  for (const log of syncLogs ?? []) {
    if (!lastSyncByCategory.has(log.category)) {
      lastSyncByCategory.set(log.category, log)
    }
  }

  return (
    <div className="space-y-5 pt-8 mt-8 border-t" style={{ borderColor: 'var(--border)' }}>
      <div>
        <h2 className="font-serif text-lg text-gray-900 dark:text-white mb-1">Crypto.com Exchange</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Connect your Crypto.com Exchange account to sync balances, trades, and staking rewards.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-lg border border-red-200 dark:border-red-800">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 rounded-lg border border-emerald-200 dark:border-emerald-800">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}

      {!hasCredentials && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Create a <strong>read-only</strong> API key on the exchange (User Center → Settings → API Keys — the default
            "Can Read" permission is all this app needs; do not enable trading or withdrawal). If you set an IP
            whitelist on the key, it must include this device's IP.
          </p>
          <div className="grid gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">API Key</label>
              <input
                type="text"
                value={credentials.apiKey}
                onChange={(e) => setCredentials((c) => ({ ...c, apiKey: e.target.value }))}
                className="w-full text-sm border rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                style={{ borderColor: 'var(--border)' }}
                placeholder="Your API key"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Secret Key</label>
              <input
                type="password"
                value={credentials.apiSecret}
                onChange={(e) => setCredentials((c) => ({ ...c, apiSecret: e.target.value }))}
                className="w-full text-sm border rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                style={{ borderColor: 'var(--border)' }}
                placeholder="Your secret key"
              />
            </div>
          </div>
        </div>
      )}

      {hasCredentials && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Credentials are encrypted and stored locally. Auto-sync on the Investments page. The exchange retains ~6
          months of trade history, so the first sync covers the last 180 days; older holdings get an estimated cost
          basis (flagged in Holdings). Trade history syncs at the exchange's rate limit (~1 request/second) — the first
          sync can take a few minutes.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        {!hasCredentials && (
          <button
            onClick={handleSave}
            disabled={loading}
            className="text-sm font-medium px-4 py-2 rounded-full text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </button>
        )}
        <button
          onClick={handleTest}
          disabled={testing || loading}
          className="text-sm font-medium px-4 py-2 rounded-full border transition-colors disabled:opacity-50"
          style={{ borderColor: 'var(--border)' }}
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test Connection'}
        </button>
        <button
          onClick={handleSync}
          disabled={syncing || loading}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full border transition-colors disabled:opacity-50"
          style={{ borderColor: 'var(--border)' }}
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span>Full Sync</span>
        </button>
        {hasCredentials && (
          <button
            onClick={handleDisconnect}
            disabled={loading}
            className="text-sm font-medium px-4 py-2 rounded-full border text-red-600 dark:text-red-400 transition-colors disabled:opacity-50"
            style={{ borderColor: 'var(--border)' }}
          >
            <Unlink className="w-4 h-4 inline" />
            <span className="ml-1">Disconnect</span>
          </button>
        )}
      </div>

      <SyncProgressBar progress={syncProgress} syncing={syncing} />

      {lastSyncByCategory.size > 0 && (
        <div className="space-y-2 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Last Sync</h3>
          <div className="grid gap-2">
            {Array.from(lastSyncByCategory.entries()).map(([category, log]) => (
              <div
                key={category}
                className="flex items-center justify-between text-sm px-3 py-2 rounded-lg border"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
              >
                <span className="text-gray-700 dark:text-gray-300 capitalize">{category.replace('_', ' ')}</span>
                <div className="flex items-center gap-2">
                  {log.status === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                  ) : log.status === 'failure' ? (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                  )}
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(log.lastSyncAt).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
