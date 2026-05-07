import type { BrokerageSyncLog } from '@lokfi/brokerage-core'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertCircle, CheckCircle, Loader2, RefreshCw, Unlink } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  CredentialManager,
  DexieCredentialStore,
  DexieSyncAdapter,
  SyncOrchestrator,
  TigerProvider,
  computeIncrementalSince,
} from '../../lib/brokerage'
import type { TigerClientConfig } from '../../lib/brokerage'
import { SyncProgressBar } from '../../lib/brokerage/SyncProgressBar'
import type { SyncProgress } from '../../lib/brokerage/sync-orchestrator'
import { db } from '../../lib/db/db'

const SOURCE = 'tiger'

export function BrokerageSettingsPage() {
  const [credentials, setCredentials] = useState({ tigerId: '', privateKey: '', account: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [hasCredentials, setHasCredentials] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [syncProgress, setSyncProgress] = useState<SyncProgress[]>([])

  const credManager = useMemo(() => new CredentialManager(new DexieCredentialStore(db)), [])

  const syncLogs = useLiveQuery(() => db.brokerageSyncLog.where('source').equals(SOURCE).reverse().toArray(), [])

  // Check if credentials exist
  useEffect(() => {
    credManager.hasCredentials(SOURCE).then(setHasCredentials)
  }, [])

  function showError(msg: string) {
    setError(msg)
    setTimeout(() => setError(null), 5000)
  }

  function showSuccess(msg: string) {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 5000)
  }

  async function handleSave() {
    if (!credentials.tigerId || !credentials.privateKey || !credentials.account) {
      showError('Please fill in all fields')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await credManager.store(SOURCE, credentials)
      setHasCredentials(true)
      showSuccess('Credentials saved')
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save credentials')
    } finally {
      setLoading(false)
    }
  }

  async function handleTest() {
    // Auto-save if credentials are filled in but not yet stored
    if (!hasCredentials) {
      if (!credentials.tigerId || !credentials.privateKey || !credentials.account) {
        showError('Please fill in all fields first')
        return
      }
      try {
        await credManager.store(SOURCE, credentials)
        setHasCredentials(true)
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to save credentials')
        return
      }
    }

    setTesting(true)
    setError(null)
    try {
      const stored = await credManager.retrieve(SOURCE)
      if (!stored) {
        showError('No credentials found')
        return
      }
      const config: TigerClientConfig = {
        tigerId: stored.tigerId,
        privateKey: stored.privateKey,
        account: stored.account,
      }
      const provider = new TigerProvider({ config })
      const ok = await provider.validateConnection()
      if (ok) {
        showSuccess('Connection successful')
      } else {
        showError('Connection failed — check your credentials')
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Connection test failed')
    } finally {
      setTesting(false)
    }
  }

  async function handleSync() {
    // Auto-save if credentials are filled in but not yet stored
    if (!hasCredentials) {
      if (!credentials.tigerId || !credentials.privateKey || !credentials.account) {
        showError('Please fill in all fields first')
        return
      }
      try {
        await credManager.store(SOURCE, credentials)
        setHasCredentials(true)
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to save credentials')
        return
      }
    }

    setSyncing(true)
    setError(null)
    setSyncProgress([])
    try {
      const stored = await credManager.retrieve(SOURCE)
      if (!stored) {
        showError('No credentials found')
        return
      }
      const config: TigerClientConfig = {
        tigerId: stored.tigerId,
        privateKey: stored.privateKey,
        account: stored.account,
      }
      const provider = new TigerProvider({ config })
      const adapter = new DexieSyncAdapter(db)
      const since = await computeIncrementalSince(adapter, SOURCE)
      const orchestrator = new SyncOrchestrator({
        provider,
        database: adapter,
        onProgress: (p) => setSyncProgress((prev) => [...prev, p]),
      })
      await orchestrator.sync(undefined, since)
      showSuccess('Sync completed')
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect Tiger Brokers? This will remove all synced brokerage data.')) return
    setLoading(true)
    try {
      await credManager.remove(SOURCE)
      await db.brokerageTransactions.clear()
      await db.brokerageFundDetails.clear()
      await db.brokeragePositions.clear()
      await db.brokeragePositionExtensions.clear()
      await db.brokerageAccounts.clear()
      await db.brokerageSyncLog.where('source').equals(SOURCE).delete()
      setHasCredentials(false)
      setCredentials({ tigerId: '', privateKey: '', account: '' })
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
    <div className="max-w-xl mx-auto px-5 py-8">
      <h1 className="font-serif text-2xl text-gray-900 dark:text-white mb-1">Brokerage Settings</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Connect your Tiger Brokers account to sync trades and dividends.
      </p>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-lg border border-red-200 dark:border-red-800">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 rounded-lg border border-emerald-200 dark:border-emerald-800">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}

      {!hasCredentials ? (
        <div
          className="text-center p-8 rounded-xl border"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
        >
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Connect your Tiger Brokers account to sync trades and dividends
          </p>
        </div>
      ) : null}

      <div className="space-y-5">
        {/* Credentials */}
        {!hasCredentials && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">API Credentials</h2>
            <div className="grid gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tiger ID</label>
                <input
                  type="text"
                  value={credentials.tigerId}
                  onChange={(e) => setCredentials((c) => ({ ...c, tigerId: e.target.value }))}
                  className="w-full text-sm border rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  style={{ borderColor: 'var(--border)' }}
                  placeholder="Your Tiger ID"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Private Key</label>
                <input
                  type="password"
                  value={credentials.privateKey}
                  onChange={(e) => setCredentials((c) => ({ ...c, privateKey: e.target.value }))}
                  className="w-full text-sm border rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  style={{ borderColor: 'var(--border)' }}
                  placeholder="Your private key"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Account</label>
                <input
                  type="text"
                  value={credentials.account}
                  onChange={(e) => setCredentials((c) => ({ ...c, account: e.target.value }))}
                  className="w-full text-sm border rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  style={{ borderColor: 'var(--border)' }}
                  placeholder="Account number"
                />
              </div>
            </div>
          </div>
        )}

        {/* Sync status — shown after first save */}
        {hasCredentials && (
          <div className="space-y-1">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Credentials are encrypted and stored locally. Auto-sync on the Investments page. Sync range is computed
              automatically (incremental from last sync, or all-time on first sync).
            </p>
          </div>
        )}

        {/* Actions */}
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
            className="text-sm font-medium px-4 py-2 rounded-full border transition-colors disabled:opacity-50"
            style={{ borderColor: 'var(--border)' }}
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-1">Sync Now</span>
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

        {/* Sync progress */}
        <SyncProgressBar progress={syncProgress} syncing={syncing} />

        {/* Sync status */}
        {lastSyncByCategory.size > 0 && (
          <div className="space-y-2 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Last Sync</h2>
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
    </div>
  )
}
