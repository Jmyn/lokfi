import { useMemo, useState } from 'react'
import { fmt } from '../../../lib/format'
import { useFinances } from '../FinancesContext'

type Period = 'daily' | 'weekly' | 'monthly'

export function AverageSpending() {
  const { transactions } = useFinances()
  const [period, setPeriod] = useState<Period>('monthly')

  const { avg, periodCount } = useMemo(() => {
    const expenses = transactions.filter((t) => t.transactionValue < 0)
    if (expenses.length === 0) return { avg: 0, periodCount: 0 }

    const total = expenses.reduce((s, t) => s + Math.abs(t.transactionValue), 0)

    // Full calendar span from all filtered transactions
    let minDate = transactions[0]!.date
    let maxDate = transactions[0]!.date
    for (const t of transactions) {
      if (t.date < minDate) minDate = t.date
      if (t.date > maxDate) maxDate = t.date
    }
    const start = new Date(minDate)
    const end = new Date(maxDate)

    let count = 0
    if (period === 'daily') {
      count = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
    } else if (period === 'weekly') {
      const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
      count = Math.ceil(days / 7)
    } else {
      // monthly
      count = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1
    }

    return { avg: total / count, periodCount: count }
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
                  ? {
                      backgroundColor: 'var(--accent)',
                      borderColor: 'var(--accent)',
                      color: '#fff',
                    }
                  : { backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }
              }
            >
              {p}
            </button>
          ))}
        </div>

        <div className="font-mono text-3xl font-medium text-gray-900 dark:text-white">{fmt.format(avg)}</div>
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          avg per {period === 'daily' ? 'day' : period === 'weekly' ? 'week' : 'month'}
          {' · '}
          {periodCount} {period === 'daily' ? 'days' : period === 'weekly' ? 'weeks' : 'months'} of data
        </div>
      </div>
    </section>
  )
}
