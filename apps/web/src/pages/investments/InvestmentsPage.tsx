import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { RefreshCw, Settings } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CONFIGURED_SOURCES,
  CdcProvider,
  CredentialManager,
  DexieCredentialStore,
  DexieSyncAdapter,
  SyncOrchestrator,
  computeIncrementalSince,
  createBrokerageProvider,
  enrichCdcPositions,
} from '../../lib/brokerage'
import { SyncProgressBar } from '../../lib/brokerage/SyncProgressBar'
import type { SyncCategoryOverrides, SyncProgress } from '../../lib/brokerage/sync-orchestrator'
import { db } from '../../lib/db/db'
import { useFxRates } from '../../lib/fx/useFxRates'
import { ClosedPositionsTab } from './ClosedPositionsTab'
import { CurrencySelector } from './CurrencySelector'
import { DividendsTab } from './DividendsTab'
import { HoldingsTab } from './HoldingsTab'
import { InvestmentsTabs } from './InvestmentsTabs'
import { InvestmentsTransactionsTab } from './InvestmentsTransactionsTab'
import { OverviewTab } from './OverviewTab'
import { SignalTab } from './SignalTab'
import { type CurrencyOption, getPreferredCurrency, setPreferredCurrency } from './currencyPreference'

/** Per-source deep-sync timestamp setting key (legacy global key: brokerage_deepSyncAt) */
function deepSyncKey(source: string): string {
  return source === 'tiger' ? 'brokerage_deepSyncAt' : `brokerage_deepSyncAt:${source}`
}

export function InvestmentsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const tab = searchParams.get('tab') || 'overview'
  const validTabs = ['overview', 'holdings', 'closed', 'transactions', 'dividends', 'signals']
  const activeTab = validTabs.includes(tab) ? tab : 'overview'

  const [preferredCurrency, setPreferredCurrencyState] = useState<CurrencyOption>('SGD')
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [syncProgress, setSyncProgress] = useState<SyncProgress[]>([])

  // Track whether auto-sync has been triggered since mount
  const autoSyncDone = useRef(false)

  const credManager = useMemo(() => new CredentialManager(new DexieCredentialStore(db)), [])
  const { rates: fxRates, lastUpdated: fxLastUpdated, error: fxError } = useFxRates('USD')

  const hasCredentials = useLiveQuery(() => db.brokerageCredentials.count(), []) ?? 0

  const lastSyncLog = useLiveQuery(async () => {
    const logs = await db.brokerageSyncLog.orderBy('lastSyncAt').reverse().limit(1).toArray()
    return logs[0] ?? null
  }, [])

  useEffect(() => {
    getPreferredCurrency().then(setPreferredCurrencyState)
  }, [])

  function setTab(newTab: string) {
    navigate({ to: '/investments', search: { tab: newTab } })
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

  // ── Auto-sync on mount ──────────────────────────────────────────────
  // Only triggers once per mount (guarded by autoSyncDone ref). If credentials
  // are added later (e.g. user saves them in Settings and comes back), a manual
  // "Sync Now" click is needed — the auto-sync is intentionally one-shot.
  // If the component unmounts mid-sync, the aborted flag prevents stale state
  // updates, but the API calls still complete (data keeps syncing).
  useEffect(() => {
    let aborted = false
    ;(async () => {
      if (autoSyncDone.current) return
      if (!hasCredentials) return
      if (syncing) return
      if (aborted) return

      autoSyncDone.current = true
      setError(null)
      setSuccess(null)
      if (!aborted) await runSync()
    })()
    return () => {
      aborted = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCredentials])

  async function handleSync() {
    setError(null)
    setSuccess(null)
    setSyncProgress([])
    await runSync()
  }

  /**
   * Core sync runner — iterates every configured source that has stored
   * credentials, computes its incremental `since`, and executes the sync.
   * Sources fail independently; CDC positions are basis-enriched after
   * the sync persists trades and fund details.
   */
  async function runSync() {
    setSyncing(true)
    setSyncProgress([])
    try {
      const adapter = new DexieSyncAdapter(db)
      const synced: string[] = []
      const sourceErrors: string[] = []
      let anyCredentials = false

      for (const source of CONFIGURED_SOURCES) {
        const stored = await credManager.retrieve(source)
        if (!stored) {
          // Distinguish legacy (undecryptable) credentials from absent ones
          const exists = await credManager.hasCredentials(source)
          if (exists) {
            anyCredentials = true
            sourceErrors.push(`${source}: credentials need to be re-saved (legacy format) — go to Brokerage Settings`)
          }
          continue
        }
        anyCredentials = true

        const provider = createBrokerageProvider(source, stored)
        if (!provider) {
          sourceErrors.push(`${source}: stored credentials are incomplete — re-save in Brokerage Settings`)
          continue
        }

        try {
          const since = await computeIncrementalSince(adapter, source, provider.maxLookbackDays)
          const orchestrator = new SyncOrchestrator({
            provider,
            database: adapter,
            onProgress: (p) => setSyncProgress((prev) => [...prev, p]),
          })

          // ── Periodic deep sync for fund_details ────────────────────
          // Dividends/rewards can post days or weeks after their business
          // date. The 14-day incremental overlap covers moderately late
          // postings; a periodic 180-day re-scan (every 7 days) catches
          // the rest. (For CDC, 180 days is also the API's full retention.)
          let categoryOverrides: SyncCategoryOverrides | undefined
          if (since !== undefined) {
            const deepSyncSetting = await db.settings.get(deepSyncKey(source))
            const now = Date.now()
            const DEEP_SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
            const isDeepSyncDue = !deepSyncSetting || now - Number(deepSyncSetting.value) > DEEP_SYNC_INTERVAL_MS

            if (isDeepSyncDue) {
              const deepSince = new Date()
              deepSince.setDate(deepSince.getDate() - 180)
              categoryOverrides = { fund_details: deepSince }
            }
          }

          await orchestrator.sync(undefined, since, categoryOverrides)

          // Update deep sync timestamp (even if fund_details failed — will
          // retry after the interval elapses again)
          if (categoryOverrides) {
            await db.settings.put({ key: deepSyncKey(source), value: String(Date.now()) })
          }

          // CDC has no API-side cost basis — recompute it from the synced
          // ledger after every sync (deep syncs included; it's idempotent).
          if (provider instanceof CdcProvider) {
            await enrichCdcPositions(db, (token, date) => provider.getDailyClose(token, date))
          }

          synced.push(provider.displayName)
        } catch (err) {
          sourceErrors.push(`${source}: ${err instanceof Error ? err.message : 'sync failed'}`)
        }
      }

      if (!anyCredentials) {
        setError('No credentials found — go to Brokerage Settings to set up')
        return
      }
      if (sourceErrors.length > 0) {
        const msg =
          synced.length > 0
            ? `Partially synced (${synced.join(', ')}). Errors: ${sourceErrors.join('; ')}`
            : sourceErrors.join('; ')
        setError(msg)
      } else if (synced.length > 0) {
        setSuccess(`Sync completed (${synced.join(', ')})`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-3 py-8">
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
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ borderColor: 'var(--border)' }}
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
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
      <InvestmentsTabs activeTab={activeTab} onTabChange={setTab} />

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
        {activeTab === 'closed' && (
          <ClosedPositionsTab
            preferredCurrency={preferredCurrency}
            fxRates={fxRates}
            fxLastUpdated={fxLastUpdated}
            fxError={fxError}
          />
        )}
        {activeTab === 'transactions' && <InvestmentsTransactionsTab />}
        {activeTab === 'dividends' && (
          <DividendsTab
            preferredCurrency={preferredCurrency}
            fxRates={fxRates}
            fxLastUpdated={fxLastUpdated}
            fxError={fxError}
          />
        )}
        {activeTab === 'signals' && <SignalTab />}
      </div>
    </div>
  )
}
