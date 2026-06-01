import { RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CURSOR_STYLE, LEGEND_STYLE, TOOLTIP_STYLE } from '../../lib/charts/chartTheme'
import { classifyRegime } from '../../lib/signals/nineSigStrategy'
import { useNineSigLite } from '../../lib/signals/useNineSigLite'
import { useNineSigStrategy } from '../../lib/signals/useNineSigStrategy'

const TARGET = 0.09

function fmtPercent(value: number, signed = false): string {
  const sign = signed && value > 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(1)}%`
}

function fmtDelta(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(1)}pp`
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 minute ago'
  return `${mins} minutes ago`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`
}

interface KpiCardProps {
  title: string
  value: string
  subtitle?: string
  loading?: boolean
  trend?: 'up' | 'down' | 'neutral'
}

function KpiCard({ title, value, subtitle, loading, trend }: KpiCardProps) {
  const trendColor =
    trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' : trend === 'down' ? 'text-red-600 dark:text-red-400' : ''

  return (
    <div
      className="rounded-xl border p-5"
      style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
    >
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{title}</p>
      {loading ? (
        <div className="h-7 w-24 rounded animate-pulse" style={{ backgroundColor: 'var(--border)' }} />
      ) : (
        <p className={`text-xl font-semibold font-mono tabular-nums ${trendColor}`}>{value}</p>
      )}
      {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>}
    </div>
  )
}

interface SignalBadgeProps {
  signal: 'above' | 'below' | 'on_track'
  loading?: boolean
}

function SignalBadge({ signal, loading }: SignalBadgeProps) {
  if (loading) {
    return <div className="h-8 w-48 rounded-full animate-pulse" style={{ backgroundColor: 'var(--border)' }} />
  }

  const config = {
    above: {
      label: 'Above 9 Sig pace',
      classes:
        'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    },
    below: {
      label: 'Below 9 Sig pace',
      classes: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    },
    on_track: {
      label: 'On 9 Sig pace',
      classes: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700',
    },
  }

  const c = config[signal]

  return (
    <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${c.classes}`}>
      {c.label}
    </span>
  )
}

// ── 9 SIG Strategy Report ─────────────────────────────────────────────────

interface StrategyReportProps {
  // props provided by the parent hook
  result: NonNullable<ReturnType<typeof useNineSigStrategy>['result']>
  lastUpdated: string | null
  onRefresh: () => void
  isLoading: boolean
}

function StrategyReport({ result, lastUpdated, onRefresh, isLoading }: StrategyReportProps) {
  const regime = classifyRegime(result.totalBullish)

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-lg text-gray-900 dark:text-white">9 SIG Strategy</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 dark:text-gray-500">Updated: {timeAgo(lastUpdated)}</span>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50"
            style={{ borderColor: 'var(--border)' }}
            title="Refresh strategy"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Recommendation banner */}
      <div
        className={`rounded-xl border p-4 ${result.recommendation === 'TQQQ' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
              QQQ @ {formatCurrency(result.currentPrice)} — evaluated{' '}
              {new Date(result.evaluatedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </p>
            <p className="text-lg font-semibold">
              {result.recommendation === 'TQQQ' ? (
                <span className="text-emerald-700 dark:text-emerald-300">HOLD / BUY TQQQ</span>
              ) : (
                <span className="text-amber-700 dark:text-amber-300">HOLD / BUY SGOV</span>
              )}
            </p>
          </div>
          <div className="text-right">
            <p
              className={`text-2xl font-bold font-mono tabular-nums ${result.totalBullish >= 5 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
            >
              {result.totalBullish} / 9
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">bullish signals</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          {result.totalBullish >= 5 ? (
            <TrendingUp size={16} className="text-emerald-500" />
          ) : (
            <TrendingDown size={16} className="text-red-500" />
          )}
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {regime.label} — {regime.description}
          </span>
        </div>
      </div>

      {/* Signal scorecard table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-sidebar)' }}>
              <th
                className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 border-b"
                style={{ borderColor: 'var(--border)' }}
              >
                #
              </th>
              <th
                className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 border-b"
                style={{ borderColor: 'var(--border)' }}
              >
                Pair
              </th>
              <th
                className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400 border-b font-mono"
                style={{ borderColor: 'var(--border)' }}
              >
                Short SMA
              </th>
              <th
                className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400 border-b font-mono"
                style={{ borderColor: 'var(--border)' }}
              >
                Long SMA
              </th>
              <th
                className="text-center px-3 py-2 font-medium text-gray-500 dark:text-gray-400 border-b"
                style={{ borderColor: 'var(--border)' }}
              >
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {result.scores.map((s) => (
              <tr key={s.pair.id} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                <td className="px-3 py-2 text-gray-400 dark:text-gray-500">{s.pair.id}</td>
                <td className="px-3 py-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                  {s.pair.shortLabel} vs {s.pair.longLabel}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono tabular-nums ${s.shortSMA !== null ? '' : 'text-gray-400'}`}
                  style={{ color: 'var(--text-primary)' }}
                >
                  {s.shortSMA !== null ? formatCurrency(s.shortSMA) : '—'}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono tabular-nums ${s.longSMA !== null ? '' : 'text-gray-400'}`}
                  style={{ color: 'var(--text-primary)' }}
                >
                  {s.longSMA !== null ? formatCurrency(s.longSMA) : '—'}
                </td>
                <td className="px-3 py-2 text-center">
                  {s.dataIssue ? (
                    <span className="text-xs text-gray-400" title={s.dataIssue}>
                      ⚠
                    </span>
                  ) : s.isBull ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <TrendingUp size={14} /> BULL
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                      <TrendingDown size={14} /> BEAR
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Context note */}
      <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1 leading-relaxed">
        <p>
          <strong>How it works:</strong> The 9 SIG strategy reads SMA cross-overs on QQQ (not TQQQ).{' '}
          {result.totalBullish >= 5
            ? `With ${result.totalBullish}/9 bullish signals, the recommendation is to hold or buy TQQQ.`
            : `With only ${result.totalBullish}/9 bullish signals, the recommendation is to move to SGOV (T-bills).`}{' '}
          Evaluate on the last trading day of each month; execute on the first trading day of the next month.
        </p>
        <p>
          <strong>Regime:</strong> {regime.label} — {regime.description}
        </p>
        <p>
          <strong>Note:</strong> Singapore context: no capital gains tax on TQQQ↔SGOV switches. SGOV alternatives: BIL,
          USFR, or USD money market fund.
        </p>
      </div>
    </div>
  )
}

// ── Main SignalTab Component ──────────────────────────────────────────────

export function SignalTab() {
  const {
    state,
    isLoading: liteLoading,
    isError: liteError,
    error: liteErrorMsg,
    refetch: liteRefetch,
    lastUpdated,
    provider,
    allProvidersCount,
    bars,
  } = useNineSigLite('TQQQ')

  const {
    result: strategyResult,
    isLoading: strategyLoading,
    isError: strategyError,
    error: strategyErrorMsg,
    refetch: strategyRefetch,
    lastUpdated: strategyLastUpdated,
  } = useNineSigStrategy('QQQ')

  const anyLoading = liteLoading || strategyLoading

  // ── Empty state: no provider ──────────────────────────────────────────
  if (!anyLoading && !liteError && !state && provider === null) {
    return (
      <div
        className="text-center py-16 rounded-xl border"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <p className="text-gray-600 dark:text-gray-400 mb-4">Connect your Tiger account to see the 9 Sig signal.</p>
        <a
          href="/settings/brokerage"
          className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full text-white transition-colors"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          Brokerage Settings
        </a>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────
  if ((liteError || strategyError) && !anyLoading) {
    const errMsg = liteErrorMsg || strategyErrorMsg
    return (
      <div
        className="text-center py-16 rounded-xl border"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <p className="text-red-600 dark:text-red-400 mb-2 font-medium">Failed to load signal</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{errMsg}</p>
        <button
          onClick={() => {
            liteRefetch()
            strategyRefetch()
          }}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full border transition-colors"
          style={{ borderColor: 'var(--border)' }}
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    )
  }

  // ── Loading state (skeletons) ─────────────────────────────────────────
  if (anyLoading || !state) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <SignalBadge signal="on_track" loading />
          <div className="h-5 w-32 rounded animate-pulse" style={{ backgroundColor: 'var(--border)' }} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard title="91-Day Growth" value="" loading />
          <KpiCard title="9% Target" value="" loading />
          <KpiCard title="Delta" value="" loading />
          <KpiCard title="Days Analyzed" value="" loading />
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
          <div className="h-[220px] rounded animate-pulse" style={{ backgroundColor: 'var(--border)' }} />
        </div>
        {/* Strategy skeleton */}
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--border)' }}>
          <div className="h-6 w-32 rounded animate-pulse" style={{ backgroundColor: 'var(--border)' }} />
          <div className="h-20 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--border)' }} />
          <div className="h-48 rounded animate-pulse" style={{ backgroundColor: 'var(--border)' }} />
        </div>
      </div>
    )
  }

  // ── Main content ──────────────────────────────────────────────────────
  const isAbove = state.signal === 'above'
  const isBelow = state.signal === 'below'
  const growthTrend = isAbove ? 'up' : isBelow ? 'down' : 'neutral'

  const chartData = bars.map((bar) => ({
    label: formatDate(bar.timestamp),
    price: bar.close,
  }))

  return (
    <div className="flex flex-col gap-6">
      {/* ── 9 Sig Lite Section ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-6 pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
        {/* Signal badge + toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <SignalBadge signal={state.signal} />
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 dark:text-gray-500">Last updated: {timeAgo(lastUpdated)}</span>
            <button
              onClick={liteRefetch}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border transition-colors"
              style={{ borderColor: 'var(--border)' }}
              title="Refresh signal"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard title="91-Day Growth" value={fmtPercent(state.growth, true)} trend={growthTrend} />
          <KpiCard title="9% Target" value={fmtPercent(state.target)} />
          <KpiCard
            title="Delta"
            value={fmtDelta(state.delta)}
            trend={growthTrend}
            subtitle={isAbove ? 'Above target' : isBelow ? 'Below target' : 'On track'}
          />
          <KpiCard title="Days Analyzed" value={`${state.daysAnalyzed}`} subtitle="of 91 days" />
        </div>

        {/* Price chart */}
        {chartData.length > 0 ? (
          <div
            className="rounded-xl border p-4"
            style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
          >
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fontFamily: 'DM Mono', fill: '#9ca3af' }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fontFamily: 'DM Mono', fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  cursor={CURSOR_STYLE}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'TQQQ']}
                />
                <Legend wrapperStyle={LEGEND_STYLE} iconType="line" />
                <Line
                  type="monotone"
                  dataKey="price"
                  name="TQQQ Close"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <ReferenceLine
                  y={state.price91dAgo != null ? state.price91dAgo * (1 + TARGET) : undefined}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{
                    value: '9% Target',
                    position: 'right',
                    fill: '#f59e0b',
                    fontSize: 11,
                    fontFamily: 'DM Mono',
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div
            className="rounded-xl border p-4 text-center text-sm text-gray-400 dark:text-gray-500"
            style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
          >
            Price chart will appear here once daily bar data is available.
          </div>
        )}

        {/* Footer */}
        <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1">
          <p>9% is Jason Kelly's quarterly target for TQQQ. TQQQ is 3x leveraged Nasdaq.</p>
          {provider && (
            <p>
              Signal source: {provider}
              {allProvidersCount !== null && allProvidersCount > 1
                ? ` (you have ${allProvidersCount} connected brokers)`
                : ''}
            </p>
          )}
        </div>
      </div>

      {/* ── 9 SIG Strategy Section ─────────────────────────────────────── */}
      {strategyResult ? (
        <StrategyReport
          result={strategyResult}
          lastUpdated={strategyLastUpdated}
          onRefresh={strategyRefetch}
          isLoading={strategyLoading}
        />
      ) : strategyError ? (
        <div
          className="text-center py-8 rounded-xl border"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
        >
          <p className="text-red-600 dark:text-red-400 mb-2 font-medium">Failed to load 9 SIG strategy</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{strategyErrorMsg}</p>
        </div>
      ) : strategyLoading ? (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--border)' }}>
          <div className="h-6 w-32 rounded animate-pulse" style={{ backgroundColor: 'var(--border)' }} />
          <div className="h-20 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--border)' }} />
          <div className="h-48 rounded animate-pulse" style={{ backgroundColor: 'var(--border)' }} />
        </div>
      ) : null}
    </div>
  )
}

export default SignalTab
