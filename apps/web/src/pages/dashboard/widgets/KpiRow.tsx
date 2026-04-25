import { useMemo } from 'react'
import { fmt } from '../../../lib/format'
import { useDashboard } from '../DashboardContext'

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  trend?: { direction: 'up' | 'down' | 'flat'; label: string }
}

function KpiCard({ label, value, sub, trend }: KpiCardProps) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl border p-5"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-medium text-gray-900 dark:text-white">{value}</span>
        {trend && (
          <span
            className="text-xs font-medium"
            style={{
              color: trend.direction === 'up' ? '#ef4444' : trend.direction === 'down' ? '#16a34a' : '#9ca3af',
            }}
          >
            {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'} {trend.label}
          </span>
        )}
      </div>
      {sub && <span className="text-xs text-gray-400 dark:text-gray-500">{sub}</span>}
    </div>
  )
}

export function KpiRow() {
  const { transactions, categories } = useDashboard()

  const stats = useMemo(() => {
    const expenses = transactions.filter((t) => t.transactionValue < 0)
    const income = transactions.filter((t) => t.transactionValue > 0)
    const totalSpend = expenses.reduce((s, t) => s + Math.abs(t.transactionValue), 0)
    const totalIncome = income.reduce((s, t) => s + t.transactionValue, 0)

    // Monthly breakdown for average
    const months = new Set(expenses.map((t) => t.date.slice(0, 7)))
    const avgMonthly = months.size > 0 ? totalSpend / months.size : 0

    // Savings rate
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalSpend) / totalIncome) * 100 : 0

    // Top category
    const catMap = new Map<string, number>()
    for (const t of expenses) {
      const catId = t.manualCategory ?? t.category
      if (!catId) continue
      catMap.set(catId, (catMap.get(catId) ?? 0) + Math.abs(t.transactionValue))
    }
    const topCatEntry = [...catMap.entries()].sort((a, b) => b[1] - a[1])[0]
    const topCat = topCatEntry ? categories.find((c) => c.id === topCatEntry[0]) : null

    // Trend: compare first half vs second half of filtered period
    const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date))
    const mid = Math.floor(sorted.length / 2)
    const firstHalf = sorted.slice(0, mid).reduce((s, t) => s + Math.abs(t.transactionValue), 0)
    const secondHalf = sorted.slice(mid).reduce((s, t) => s + Math.abs(t.transactionValue), 0)
    const spendTrend =
      firstHalf === 0 ? 'flat' : secondHalf > firstHalf * 1.05 ? 'up' : secondHalf < firstHalf * 0.95 ? 'down' : 'flat'

    const trendPct = firstHalf > 0 ? Math.abs(((secondHalf - firstHalf) / firstHalf) * 100) : 0

    // Uncategorised count
    const uncategorisedCount = expenses.filter((t) => !t.manualCategory && !t.category).length

    return {
      totalSpend,
      savingsRate,
      avgMonthly,
      monthCount: months.size,
      topCat,
      topCatValue: topCatEntry?.[1] ?? 0,
      spendTrend: spendTrend as 'up' | 'down' | 'flat',
      trendPct,
      uncategorisedCount,
    }
  }, [transactions, categories])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total spent"
          value={fmt.format(stats.totalSpend)}
          sub={`across ${stats.monthCount} months`}
          trend={
            stats.trendPct > 0 ? { direction: stats.spendTrend, label: `${stats.trendPct.toFixed(0)}%` } : undefined
          }
        />
        <KpiCard
          label="Savings rate"
          value={stats.savingsRate > 0 ? `${stats.savingsRate.toFixed(1)}%` : 'N/A'}
          sub="income minus expenses"
        />
        <KpiCard label="Monthly average" value={fmt.format(stats.avgMonthly)} sub="expenses only" />
        <KpiCard
          label="Top category"
          value={stats.topCat?.name ?? '—'}
          sub={stats.topCat ? fmt.format(stats.topCatValue) : 'No categories yet'}
        />
      </div>

      {stats.uncategorisedCount > 0 && (
        <div
          className="rounded-lg border px-4 py-3 text-sm flex items-center gap-2"
          style={{
            borderColor: 'var(--accent)',
            backgroundColor: 'var(--accent-subtle)',
            color: 'var(--accent-text)',
          }}
        >
          <span className="font-semibold">{stats.uncategorisedCount} uncategorised expenses</span>
          <span>—</span>
          <span>add rules on the Rules page for richer category data.</span>
        </div>
      )}
    </div>
  )
}
