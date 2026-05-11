import { useLiveQuery } from 'dexie-react-hooks'
import { AlertCircle, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { CATEGORY_PALETTE } from '../../lib/charts/chartPalette'
import { TOOLTIP_STYLE } from '../../lib/charts/chartTheme'
import { db } from '../../lib/db/db'
import { convertAmount } from '../../lib/fx/convert'
import {
  getPortfolioBucketAggregation,
  type DbPortfolioBucket,
  type DbPortfolioBucketAssignment,
} from '../../lib/investments/portfolioBuckets'
import type { CurrencyOption } from './currencyPreference'

export interface OverviewTabProps {
  /** User's preferred display currency */
  preferredCurrency: CurrencyOption
  /** Cached FX rates map (base currency rates) */
  fxRates: Record<string, number> | null
  /** ISO timestamp of when FX rates were last fetched */
  fxLastUpdated: string | null
  /** Error message if FX rates failed to load */
  fxError: string | null
}

interface KpiCardProps {
  title: string
  value: string
  secondary?: string
  warning?: string
  trend?: 'positive' | 'negative' | 'neutral'
  loading?: boolean
}

function KpiCard({ title, value, secondary, warning, trend, loading }: KpiCardProps) {
  if (loading) {
    return (
      <div
        className="animate-pulse rounded-xl border p-5"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <div className="mb-3 h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-8 w-32 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    )
  }

  const valueColor =
    trend === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : trend === 'negative'
        ? 'text-red-600 dark:text-red-400'
        : 'text-gray-900 dark:text-white'

  const TrendIcon = trend === 'positive' ? TrendingUp : trend === 'negative' ? TrendingDown : Minus

  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
    >
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</div>
      <div className="flex items-center gap-2">
        {trend && <TrendIcon size={18} className={valueColor} />}
        <span className={`font-mono text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</span>
      </div>
      {secondary && <div className="mt-1 text-xs text-gray-400">{secondary}</div>}
      {warning && (
        <div className="mt-1 flex items-center gap-1 text-xs text-amber-500">
          <AlertCircle size={12} />
          <span>{warning}</span>
        </div>
      )}
    </div>
  )
}

function AllocationChart({
  positions,
  totalValue,
  preferredCurrency,
  fxRates,
  loading,
}: {
  positions: import('@lokfi/brokerage-core').BrokeragePosition[]
  totalValue: number
  preferredCurrency: CurrencyOption
  fxRates: Record<string, number> | null
  loading?: boolean
}) {
  if (loading) {
    return (
      <div
        className="animate-pulse rounded-xl border p-5"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <div className="mb-4 h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="flex justify-center">
          <div className="h-48 w-48 rounded-full bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    )
  }

  if (positions.length === 0) {
    return null
  }

  // Group by secType
  const grouped: Record<string, number> = {}
  for (const p of positions) {
    const secType = p.secType ?? 'OTHER'
    const value = p.marketValue ?? p.quantity * p.avgCost
    const shouldConvert = preferredCurrency !== 'Original' && fxRates != null
    const convertedValue = shouldConvert ? convertAmount(value, p.currency, preferredCurrency, fxRates) : value
    grouped[secType] = (grouped[secType] ?? 0) + convertedValue
  }

  const data = Object.entries(grouped)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({
      name,
      value,
      pct: totalValue > 0 ? (value / totalValue) * 100 : 0,
    }))

  if (data.length === 0) return null

  const renderLabel = ({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(1)}%`

  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
    >
      <h3 className="mb-4 font-serif text-sm font-medium text-gray-900 dark:text-white">Asset Allocation</h3>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={75}
            dataKey="value"
            labelLine={false}
            label={renderLabel}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number) => [
              value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              'Value',
            ]}
          />
          <Legend formatter={(value: string) => value} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

function PortfolioBucketBreakdown({
  positions,
  buckets,
  assignments,
  preferredCurrency,
  fxRates,
}: {
  positions: import('@lokfi/brokerage-core').BrokeragePosition[]
  buckets: DbPortfolioBucket[]
  assignments: DbPortfolioBucketAssignment[]
  preferredCurrency: CurrencyOption
  fxRates: Record<string, number> | null
}) {
  const shouldConvert = preferredCurrency !== 'Original' && fxRates != null
  const rows = getPortfolioBucketAggregation({
    positions,
    buckets,
    assignments,
    convertValue: (value, position) =>
      shouldConvert ? convertAmount(value, position.currency, preferredCurrency, fxRates) : value,
  })

  if (rows.length === 0) return null

  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
    >
      <h3 className="mb-4 font-serif text-sm font-medium text-gray-900 dark:text-white">Portfolio by bucket</h3>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={rows}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={75}
            dataKey="value"
            labelLine={false}
            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(1)}%`}
          >
            {rows.map((row) => (
              <Cell key={row.bucketId} fill={row.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number) => [
              value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              'Value',
            ]}
          />
          <Legend formatter={(value: string) => value} />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.bucketId} className="flex items-center justify-between text-xs">
            <span className="flex min-w-0 items-center gap-2 text-gray-700 dark:text-gray-300">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
              <span className="truncate">{row.name}</span>
            </span>
            <span className="font-mono text-gray-500 dark:text-gray-400">
              {row.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({row.pct.toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CurrencyBreakdown({
  positions,
  accounts,
  totalValue,
  preferredCurrency,
  fxRates,
  loading,
}: {
  positions: import('@lokfi/brokerage-core').BrokeragePosition[]
  accounts: import('@lokfi/brokerage-core').BrokerageAccount[]
  totalValue: number
  preferredCurrency: CurrencyOption
  fxRates: Record<string, number> | null
  loading?: boolean
}) {
  if (loading) {
    return (
      <div
        className="animate-pulse rounded-xl border p-5"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <div className="mb-4 h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="mb-3 flex items-center gap-3">
            <div className="h-4 w-12 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-2 flex-1 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
      </div>
    )
  }

  if (positions.length === 0 && accounts.length === 0) {
    return null
  }

  // Aggregate by currency
  const currencyTotals: Record<string, { converted: number; original: number }> = {}
  const shouldConvert = preferredCurrency !== 'Original' && fxRates != null

  for (const p of positions) {
    const value = p.marketValue ?? p.quantity * p.avgCost
    const convertedValue = shouldConvert ? convertAmount(value, p.currency, preferredCurrency, fxRates) : value
    if (!currencyTotals[p.currency]) currencyTotals[p.currency] = { converted: 0, original: 0 }
    currencyTotals[p.currency].converted += convertedValue
    currencyTotals[p.currency].original += value
  }

  for (const acc of accounts) {
    const convertedValue = shouldConvert
      ? convertAmount(acc.cashBalance, acc.currency, preferredCurrency, fxRates)
      : acc.cashBalance
    if (!currencyTotals[acc.currency]) currencyTotals[acc.currency] = { converted: 0, original: 0 }
    currencyTotals[acc.currency].converted += convertedValue
    currencyTotals[acc.currency].original += acc.cashBalance
  }

  const entries = Object.entries(currencyTotals).filter(([, c]) => c.converted > 0 || c.original > 0)

  if (entries.length === 0) return null

  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
    >
      <h3 className="mb-4 font-serif text-sm font-medium text-gray-900 dark:text-white">Currency Breakdown</h3>
      <div className="space-y-3">
        {entries.map(([currency, c]) => {
          const pct = totalValue > 0 ? (c.converted / totalValue) * 100 : 0
          const needsWarning = shouldConvert && currency !== preferredCurrency && !fxRates?.[currency]
          return (
            <div key={currency}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-gray-700 dark:text-gray-300">{currency}</span>
                <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                  {c.converted.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  {needsWarning && <AlertCircle size={10} className="text-amber-500" />}
                  <span className="text-gray-400">({pct.toFixed(1)}%)</span>
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${Math.min(pct, 100)}%`,
                    backgroundColor:
                      CATEGORY_PALETTE[entries.findIndex(([k]) => k === currency) % CATEGORY_PALETTE.length],
                  }}
                />
              </div>
              {shouldConvert && currency !== preferredCurrency && (
                <div className="mt-0.5 text-xs text-gray-400">
                  Original:{' '}
                  {c.original.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                  {currency}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PerformanceSparkline() {
  // TODO: Implement historical snapshots — store portfolio value snapshots in
  // brokerageAccounts history or a dedicated snapshot table, then compute
  // value over time for the sparkline. Currently no historical data is stored.
  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-serif text-sm font-medium text-gray-900 dark:text-white">Performance</h3>
        <div className="flex gap-1">
          {['1M', '3M', '6M', '1Y', 'YTD', 'All'].map((range) => (
            <button
              key={range}
              className="rounded px-2 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {range}
            </button>
          ))}
        </div>
      </div>
      <div className="flex h-40 items-center justify-center text-sm text-gray-400">
        Not enough data — sync again to build history
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div
      className="col-span-full rounded-xl border p-8 text-center"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
    >
      <p className="mb-4 text-gray-500 dark:text-gray-400">No portfolio data yet. Sync your brokerage account.</p>
      <a
        href="/settings/brokerage"
        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition-colors"
        style={{ backgroundColor: 'var(--accent)' }}
      >
        Brokerage Settings
      </a>
    </div>
  )
}

export function OverviewTab({
  preferredCurrency = 'SGD',
  fxRates = null,
  fxLastUpdated = null,
  fxError = null,
}: Partial<OverviewTabProps> & { preferredCurrency: CurrencyOption }) {
  const positions = useLiveQuery(() => db.brokeragePositions.toArray(), [])
  const accounts = useLiveQuery(() => db.brokerageAccounts.toArray(), [])
  const fundDetails = useLiveQuery(() => db.brokerageFundDetails.toArray(), [])
  const buckets = useLiveQuery(() => db.portfolioBuckets.orderBy('sortOrder').toArray(), [])
  const assignments = useLiveQuery(() => db.portfolioBucketAssignments.toArray(), [])

  const isLoading =
    positions === undefined ||
    accounts === undefined ||
    fundDetails === undefined ||
    buckets === undefined ||
    assignments === undefined

  // ── Derived values ─────────────────────────────────────────────────────────

  const shouldConvert = preferredCurrency !== 'Original' && fxRates != null

  // Total portfolio value: sum of positions (marketValue or qty*avgCost) + cash balances
  const totalValue = (() => {
    if (!positions || !accounts) return 0
    let sum = 0
    for (const p of positions) {
      const v = p.marketValue ?? p.quantity * p.avgCost
      sum += shouldConvert ? convertAmount(v, p.currency, preferredCurrency, fxRates) : v
    }
    for (const a of accounts) {
      sum += shouldConvert ? convertAmount(a.cashBalance, a.currency, preferredCurrency, fxRates) : a.cashBalance
    }
    return sum
  })()

  // Day change: sum of unrealizedPnl as proxy (historical snapshots not available)
  const dayChange = (() => {
    if (!positions) return null
    let sum = 0
    for (const p of positions) {
      if (p.unrealizedPnl != null) {
        const v = shouldConvert
          ? convertAmount(p.unrealizedPnl, p.currency, preferredCurrency, fxRates)
          : p.unrealizedPnl
        sum += v
      }
    }
    return sum
  })()

  // Dividends YTD
  const dividendsYtd = (() => {
    if (!fundDetails) return null
    const year = new Date().getFullYear()
    let sum = 0
    for (const fd of fundDetails) {
      if (fd.classifiedType !== 'DIVIDEND' && fd.classifiedType !== 'DIVIDEND_TAX') continue
      if (!fd.businessDate) continue
      const yearMatch = fd.businessDate.startsWith(String(year))
      if (!yearMatch) continue
      const amt = fd.amount
      const v = shouldConvert ? convertAmount(amt, fd.currency, preferredCurrency, fxRates) : amt
      sum += v
    }
    return sum
  })()

  // FX warning
  const fxWarning = fxError ?? (shouldConvert && !fxRates ? 'FX rate unavailable' : null)

  // Determine if we have any data
  const hasData = !isLoading && (positions?.length ?? 0) > 0

  // Format helpers
  const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const fmtWithSymbol = (v: number) => `${preferredCurrency === 'Original' ? '' : preferredCurrency} ${fmt(v)}`

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* KPI Row */}
      <KpiCard title="Total Portfolio Value" value={fmtWithSymbol(totalValue)} loading={isLoading} />
      <KpiCard
        title="Day Change"
        value={dayChange !== null ? fmtWithSymbol(dayChange) : '—'}
        trend={dayChange !== null ? (dayChange > 0 ? 'positive' : dayChange < 0 ? 'negative' : 'neutral') : undefined}
        loading={isLoading}
      />
      <KpiCard
        title="Dividends YTD"
        value={dividendsYtd !== null ? fmtWithSymbol(dividendsYtd) : '—'}
        secondary={fxLastUpdated ? `Rates updated ${new Date(fxLastUpdated).toLocaleDateString()}` : undefined}
        warning={fxWarning ?? undefined}
        loading={isLoading}
      />

      {/* Empty state */}
      {!isLoading && !hasData && <EmptyState />}

      {/* Allocation chart */}
      {!isLoading && hasData && (
        <AllocationChart
          positions={positions!}
          totalValue={totalValue}
          preferredCurrency={preferredCurrency}
          fxRates={fxRates}
        />
      )}

      {/* Portfolio by bucket */}
      {!isLoading && hasData && (
        <PortfolioBucketBreakdown
          positions={positions!}
          buckets={buckets!}
          assignments={assignments!}
          preferredCurrency={preferredCurrency}
          fxRates={fxRates}
        />
      )}

      {/* Currency breakdown */}
      {!isLoading && hasData && (
        <CurrencyBreakdown
          positions={positions!}
          accounts={accounts!}
          totalValue={totalValue}
          preferredCurrency={preferredCurrency}
          fxRates={fxRates}
        />
      )}

      {/* Performance sparkline */}
      {!isLoading && hasData && (
        <div className="md:col-span-2 lg:col-span-3">
          <PerformanceSparkline />
        </div>
      )}
    </div>
  )
}
