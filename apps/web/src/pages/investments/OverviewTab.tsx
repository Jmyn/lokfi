import { useLiveQuery } from 'dexie-react-hooks'
import { AlertCircle, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Area, AreaChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { AXIS_TICK, TOOLTIP_STYLE } from '../../lib/charts/chartTheme'
import { db } from '../../lib/db/db'
import type { DbPortfolioSnapshot } from '../../lib/db/db'
import { convertAmount } from '../../lib/fx/convert'
import {
  type DbPortfolioBucket,
  type DbPortfolioBucketAssignment,
  buildAssignmentLookup,
  getPortfolioBucketAggregation,
  getSecurityKey,
  isStockLikePosition,
} from '../../lib/investments/portfolioBuckets'
import {
  type RangeKey,
  type SnapshotPoint,
  computeReturn,
  filterSnapshotsByRange,
} from '../../lib/investments/portfolioPerformance'
import { usePortfolioSnapshot } from '../../lib/investments/usePortfolioSnapshot'
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

  // Bucket-level aggregation drives the legend + bottom list
  const rows = getPortfolioBucketAggregation({
    positions,
    buckets,
    assignments,
    convertValue: (value, position) =>
      shouldConvert ? convertAmount(value, position.currency, preferredCurrency, fxRates) : value,
  })

  const [expandedBuckets, setExpandedBuckets] = useState<Set<string>>(new Set())
  function toggleBucket(id: string) {
    setExpandedBuckets((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (rows.length === 0) return null

  // Per-position slices: each stock-like holding is its own slice, colored by its bucket
  const bucketColorById = new Map(rows.map((r) => [r.bucketId, r.color]))
  const bucketOrderById = new Map(rows.map((r, i) => [r.bucketId, i]))
  const assignmentBySecurity = buildAssignmentLookup(assignments)
  const slices = positions
    .filter(isStockLikePosition)
    .map((pos) => {
      const raw = pos.marketValue ?? pos.quantity * pos.avgCost
      if (raw <= 0) return null
      const value = shouldConvert ? convertAmount(raw, pos.currency, preferredCurrency, fxRates) : raw
      const bucketId = assignmentBySecurity.get(getSecurityKey(pos)) ?? 'unassigned'
      return { name: pos.symbol, value, color: bucketColorById.get(bucketId) ?? '#94a3b8', bucketId }
    })
    .filter((s): s is { name: string; value: number; color: string; bucketId: string } => s !== null)
    .sort((a, b) => {
      const orderDiff = (bucketOrderById.get(a.bucketId) ?? 999) - (bucketOrderById.get(b.bucketId) ?? 999)
      return orderDiff !== 0 ? orderDiff : b.value - a.value
    })

  // Target % lookup from the buckets prop (includes Unassigned which has no target)
  const targetPctById = new Map(buckets.map((b) => [b.id, b.targetPct ?? null]))

  // Sort buckets by value desc — used for legend and bucket rows
  const rowsByValue = [...rows].sort((a, b) => b.value - a.value)
  const legendPayload = rowsByValue.map((r) => ({ value: r.name, color: r.color, type: 'circle' as const }))

  // Group slices by bucket for the expanded holding rows
  const slicesByBucket = new Map<string, typeof slices>()
  for (const slice of slices) {
    const group = slicesByBucket.get(slice.bucketId) ?? []
    group.push(slice)
    slicesByBucket.set(slice.bucketId, group)
  }

  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
    >
      <h3 className="mb-4 font-serif text-sm font-medium text-gray-900 dark:text-white">Portfolio by bucket</h3>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={slices} cx="50%" cy="50%" innerRadius={55} outerRadius={75} dataKey="value">
            {slices.map((slice, i) => (
              <Cell key={`${slice.name}-${i}`} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number, _name: string, props: { payload?: { name: string } }) => [
              value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              props.payload?.name ?? '',
            ]}
          />
          <Legend payload={legendPayload} wrapperStyle={{ fontSize: '12px' }} />
        </PieChart>
      </ResponsiveContainer>

      <div className="mt-3 space-y-1">
        {rowsByValue.map((row) => {
          const holdings = slicesByBucket.get(row.bucketId) ?? []
          const isExpanded = expandedBuckets.has(row.bucketId)
          const targetPct = targetPctById.get(row.bucketId) ?? null
          const delta = targetPct !== null ? row.pct - targetPct : null
          const deltaColor =
            delta === null
              ? ''
              : Math.abs(delta) <= 2
                ? 'text-emerald-600 dark:text-emerald-400'
                : Math.abs(delta) <= 8
                  ? 'text-amber-500 dark:text-amber-400'
                  : 'text-red-500 dark:text-red-400'
          return (
            <div key={row.bucketId}>
              {/* Bucket header row */}
              <button
                type="button"
                onClick={() => toggleBucket(row.bucketId)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span className="text-gray-400 dark:text-gray-500">{isExpanded ? '▾' : '▸'}</span>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                <span className="font-medium text-gray-700 dark:text-gray-300">{row.name}</span>
                <span className="ml-auto font-mono text-gray-500 dark:text-gray-400">
                  {row.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="font-mono text-gray-400 dark:text-gray-500">
                  {row.pct.toFixed(1)}%
                  {targetPct !== null && <span className="text-gray-300 dark:text-gray-600"> / {targetPct}%</span>}
                </span>
                {delta !== null && (
                  <span className={`w-12 shrink-0 text-right font-mono font-medium ${deltaColor}`}>
                    {delta >= 0 ? '+' : ''}
                    {delta.toFixed(1)}%
                  </span>
                )}
              </button>

              {/* Expanded holdings */}
              {isExpanded && (
                <div className="mb-1 ml-6 space-y-1.5 pt-1">
                  {holdings.map((holding) => {
                    const withinBucketPct = row.value > 0 ? (holding.value / row.value) * 100 : 0
                    return (
                      <div key={holding.name} className="flex items-center gap-2 text-xs">
                        <span className="w-12 shrink-0 font-mono font-medium text-gray-700 dark:text-gray-300">
                          {holding.name}
                        </span>
                        <div
                          className="min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
                          style={{ height: 6 }}
                        >
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${withinBucketPct}%`, backgroundColor: row.color }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right font-mono text-gray-500 dark:text-gray-400">
                          {withinBucketPct.toFixed(1)}%
                        </span>
                        <span className="w-28 shrink-0 text-right font-mono text-gray-400 dark:text-gray-500">
                          {holding.value.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const PERFORMANCE_RANGES: RangeKey[] = ['1M', '3M', '6M', '1Y', 'YTD', 'All']

function PerformanceCard({
  snapshots,
  preferredCurrency,
  fxRates,
}: {
  snapshots: DbPortfolioSnapshot[]
  preferredCurrency: CurrencyOption
  fxRates: Record<string, number> | null
}) {
  const [range, setRange] = useState<RangeKey>('1Y')

  const shouldConvert = preferredCurrency !== 'Original' && fxRates != null

  const points: SnapshotPoint[] = snapshots.map((s) => ({
    date: s.date,
    value:
      shouldConvert && s.currency !== preferredCurrency
        ? convertAmount(s.totalValue, s.currency, preferredCurrency, fxRates)
        : s.totalValue,
  }))

  const filtered = filterSnapshotsByRange(points, range, new Date())
  const ret = computeReturn(filtered)

  const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const currencyLabel = preferredCurrency === 'Original' ? '' : `${preferredCurrency} `

  const returnColor =
    ret === null || ret.pct === 0
      ? 'text-gray-900 dark:text-white'
      : ret.pct > 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-red-600 dark:text-red-400'

  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-serif text-sm font-medium text-gray-900 dark:text-white">Performance</h3>
        <div className="flex gap-1">
          {PERFORMANCE_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                r === range
                  ? 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {ret !== null && (
        <div className="mb-4">
          <div className={`font-mono text-2xl font-semibold tabular-nums ${returnColor}`}>
            {ret.pct >= 0 ? '+' : ''}
            {ret.pct.toFixed(2)}%
          </div>
          <div className="text-xs text-gray-400">
            {ret.abs >= 0 ? '+' : ''}
            {currencyLabel}
            {fmt(ret.abs)}
          </div>
        </div>
      )}

      {filtered.length < 2 ? (
        <div className="flex h-40 items-center justify-center text-sm text-gray-400">
          Sync again to start building history
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={filtered} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="perfGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={40} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value: number) => [`${currencyLabel}${fmt(value)}`, 'Value']}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--accent)"
              strokeWidth={2}
              fill="url(#perfGradient)"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
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
  const snapshots = useLiveQuery(() => db.portfolioSnapshots.orderBy('date').toArray(), [])

  const isLoading =
    positions === undefined ||
    accounts === undefined ||
    fundDetails === undefined ||
    buckets === undefined ||
    assignments === undefined ||
    snapshots === undefined

  usePortfolioSnapshot(preferredCurrency, fxRates)

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

  // Dividends TTM (trailing 12 months)
  const dividendsTtm = (() => {
    if (!fundDetails) return null
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 1)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    let sum = 0
    for (const fd of fundDetails) {
      if (fd.classifiedType !== 'DIVIDEND' && fd.classifiedType !== 'DIVIDEND_TAX') continue
      if (!fd.businessDate || fd.businessDate < cutoffStr) continue
      const v = shouldConvert ? convertAmount(fd.amount, fd.currency, preferredCurrency, fxRates) : fd.amount
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
        title="Dividends (TTM)"
        value={dividendsTtm !== null ? fmtWithSymbol(dividendsTtm) : '—'}
        secondary={fxLastUpdated ? `Rates updated ${new Date(fxLastUpdated).toLocaleDateString()}` : undefined}
        warning={fxWarning ?? undefined}
        loading={isLoading}
      />

      {/* Empty state */}
      {!isLoading && !hasData && <EmptyState />}

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

      {/* Performance card */}
      {!isLoading && (
        <div className="md:col-span-2 lg:col-span-3">
          <PerformanceCard snapshots={snapshots!} preferredCurrency={preferredCurrency} fxRates={fxRates} />
        </div>
      )}
    </div>
  )
}
