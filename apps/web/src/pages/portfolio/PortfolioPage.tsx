import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { RefreshCw, Settings } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  CredentialManager,
  DexieCredentialStore,
  DexieSyncAdapter,
  SyncOrchestrator,
  TigerProvider,
} from '../../lib/brokerage'
import type { TigerClientConfig } from '../../lib/brokerage'
import { SyncProgressBar } from '../../lib/brokerage/SyncProgressBar'
import type { SyncProgress } from '../../lib/brokerage/sync-orchestrator'
import { db } from '../../lib/db/db'
import { useFxRates } from '../../lib/fx/useFxRates'
import { CurrencySelector } from './CurrencySelector'
import { DividendsTab } from './DividendsTab'
import { HoldingsTab } from './HoldingsTab'
import { OverviewTab } from './OverviewTab'
import { PortfolioTabs } from './PortfolioTabs'
import { PortfolioTransactionsTab } from './PortfolioTransactionsTab'
import { type CurrencyOption, getPreferredCurrency, setPreferredCurrency } from './currencyPreference'

const SOURCE = 'tiger'

export function PortfolioPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const tab = searchParams.get('tab') || 'overview'
  const validTabs = ['overview', 'holdings', 'transactions', 'dividends']
  const activeTab = validTabs.includes(tab) ? tab : 'overview'

  const [preferredCurrency, setPreferredCurrencyState] = useState<CurrencyOption>('SGD')
  const [passphrase, setPassphrase] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showSyncForm, setShowSyncForm] = useState(false)
  const [syncProgress, setSyncProgress] = useState<SyncProgress[]>([])

  const credManager = useMemo(() => new CredentialManager(new DexieCredentialStore(db)), [])
  const { rates: fxRates, lastUpdated: fxLastUpdated, error: fxError } = useFxRates('USD')

  const hasCredentials = useLiveQuery(() => db.brokerageCredentials.count(), []) ?? 0

  const lastSyncLog = useLiveQuery(async () => {
    const logs = await db.brokerageSyncLog.orderBy('lastSyncAt').reverse().limit(1).toArray()
    return logs[0] ?? null
  }, [])

  const lookbackDays = useLiveQuery(async () => {
    const s = await db.settings.get(`brokerage:${SOURCE}:lookbackDays`)
    return s ? Number.parseInt(s.value, 10) : 90
  }, [])

  useEffect(() => {
    getPreferredCurrency().then(setPreferredCurrencyState)
  }, [])

  function setTab(newTab: string) {
    navigate({ to: '/portfolio', search: { tab: newTab } })
  }

  async function handleCurrencyChange(currency: CurrencyOption) {
    setPreferredCurrencyState(currency)
    await setPreferredCurrency(currency)
  }

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(t)
    }
  }, [error])

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 5000)
      return () => clearTimeout(t)
    }
  }, [success])

  async function handleSync() {
    if (!passphrase) {
      setError('Enter your passphrase to sync')
      return
    }
    if (lookbackDays === undefined) {
      setError('Lookback days not loaded')
      return
    }
    setSyncing(true)
    setError(null)
    setSuccess(null)
    setSyncProgress([])
    try {
      const stored = await credManager.retrieve(SOURCE, passphrase)
      if (!stored) {
        setError('No credentials found')
        return
      }
      const config: TigerClientConfig = {
        tigerId: stored.tigerId,
        privateKey: stored.privateKey,
        account: stored.account,
      }
      const provider = new TigerProvider({ config })
      const adapter = new DexieSyncAdapter(db)
      const orchestrator = new SyncOrchestrator({
        provider,
        database: adapter,
        lookbackDays,
        onProgress: (p) => setSyncProgress((prev) => [...prev, p]),
      })
      await orchestrator.sync()
      setSuccess('Sync completed')
      setPassphrase('')
      setShowSyncForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-5 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-xl text-gray-900 dark:text-white">Investments</h1>
        <div className="flex items-center gap-3">
          {fxRates && preferredCurrency !== 'Original' && fxRates[preferredCurrency] && (
            <span className="text-xs text-gray-400 dark:text-gray-500" title={`Updated ${fxLastUpdated ?? 'unknown'}`}>
              1 USD = {fxRates[preferredCurrency].toFixed(4)} {preferredCurrency}
            </span>
          )}
          {fxLastUpdated && <span className="text-xs text-gray-400 dark:text-gray-500">{fxLastUpdated}</span>}
          <CurrencySelector value={preferredCurrency} onChange={handleCurrencyChange} />
          <Link
            to="/settings/brokerage"
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            title="Brokerage Settings"
          >
            <Settings size={18} />
          </Link>
        </div>
      </div>

      {/* Sync status bar */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-xl border mb-6"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <div className="flex items-center gap-3">
          {lastSyncLog ? (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Last sync: {new Date(lastSyncLog.lastSyncAt).toLocaleString()}
            </span>
          ) : (
            <span className="text-sm text-gray-500 dark:text-gray-400">Never synced</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showSyncForm ? (
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Passphrase"
                className="text-sm border rounded-lg px-3 py-1.5 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                style={{ borderColor: 'var(--border)' }}
              />
              <button
                onClick={handleSync}
                disabled={syncing}
                className="text-sm font-medium px-3 py-1.5 rounded-full text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {syncing ? 'Syncing...' : 'Confirm'}
              </button>
              <button
                onClick={() => {
                  setShowSyncForm(false)
                  setPassphrase('')
                }}
                className="text-sm px-3 py-1.5 rounded-full border transition-colors"
                style={{ borderColor: 'var(--border)' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSyncForm(true)}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border transition-colors"
              style={{ borderColor: 'var(--border)' }}
            >
              <RefreshCw size={14} />
              Sync Now
            </button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-lg border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 rounded-lg border border-emerald-200 dark:border-emerald-800">
          {success}
        </div>
      )}

      {/* Sync progress */}
      <SyncProgressBar progress={syncProgress} syncing={syncing} />

      {/* No data CTA */}
      {hasCredentials === 0 && (
        <div
          className="text-center p-8 rounded-xl border mb-6"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
        >
          <p className="text-gray-600 dark:text-gray-400 mb-4">No portfolio data yet. Sync your brokerage account.</p>
          <Link
            to="/settings/brokerage"
            className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full text-white transition-colors"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Settings size={14} />
            Brokerage Settings
          </Link>
        </div>
      )}

      {/* Tabs */}
      <PortfolioTabs activeTab={activeTab} onTabChange={setTab} />

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === 'overview' && (
          <OverviewTab
            preferredCurrency={preferredCurrency}
            fxRates={fxRates}
            fxLastUpdated={fxLastUpdated}
            fxError={fxError}
          />
        )}
        {activeTab === 'holdings' && (
          <HoldingsTab
            preferredCurrency={preferredCurrency}
            fxRates={fxRates}
            fxLastUpdated={fxLastUpdated}
            fxError={fxError}
          />
        )}
        {activeTab === 'transactions' && <PortfolioTransactionsTab />}
        {activeTab === 'dividends' && (
          <DividendsTab
            preferredCurrency={preferredCurrency}
            fxRates={fxRates}
            fxLastUpdated={fxLastUpdated}
            fxError={fxError}
          />
        )}
      </div>
    </div>
  )
}
