import { useMemo, useState } from 'react'
import { useDashboard } from '../DashboardContext'
import { fmt } from '../../../lib/format'

type Period = 'daily' | 'weekly' | 'monthly'

export function AverageSpending() {
  const { transactions } = useDashboard()
  const [period, setPeriod] = useState<Period>('monthly')

  const { avg, periodCount } = useMemo(() => {
    const expenses = transactions.filter((t) => t.transactionValue < 0)
    if (expenses.length === 0) return { avg: 0, periodCount: 0 }

    const total = expenses.reduce((s, t) => s + Math.abs(t.transactionValue), 0)

    if (period === 'daily') {
      const days = new Set(expenses.map((t) => t.date))
      return { avg: days.size > 0 ? total / days.size : 0, periodCount: days.size }
    }
    if (period === 'weekly') {
      // Group by ISO week
      const weeks = new Set(
        expenses.map((t) => {
          const d = new Date(t.date)
          const jan1 = new Date(d.getFullYear(), 0, 1)
          const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
          return `${d.getFullYear()}-W${weekNum}`
        }),
      )
      return { avg: weeks.size > 0 ? total / weeks.size : 0, periodCount: weeks.size }
    }
    // monthly
    const months = new Set(expenses.map((t) => t.date.slice(0, 7)))
    return { avg: months.size > 0 ? total / months.size : 0, periodCount: months.size }
  }, [transactions, period])

  const periods: Period[] = ['daily', 'weekly', 'monthly']

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        Average Spending
      </h2>
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        {/* Toggle */}
        <div className="flex gap-1 mb-4">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className="text-xs rounded-full px-3 py-1 border font-medium transition-colors capitalize"
              style={
                p === period
                  ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
                  : { backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }
              }
            >
              {p}
            </button>
          ))}
        </div>

        <div className="font-mono text-3xl font-medium text-gray-900 dark:text-white">
          {fmt.format(avg)}
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          avg per {period === 'daily' ? 'day' : period === 'weekly' ? 'week' : 'month'}
          {' · '}
          {periodCount} {period === 'daily' ? 'days' : period === 'weekly' ? 'weeks' : 'months'} of data
        </div>
      </div>
    </section>
  )
}
