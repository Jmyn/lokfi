import { useMemo, useState } from 'react'
import { fmt } from '../../../lib/format'
import { useFinances } from '../FinancesContext'

type Period = 'daily' | 'weekly' | 'monthly'

export function AverageIncome() {
  const { transactions } = useFinances()
  const [period, setPeriod] = useState<Period>('monthly')

  const { avg, periodCount } = useMemo(() => {
    const incomes = transactions.filter((t) => t.transactionValue > 0)
    if (incomes.length === 0) return { avg: 0, periodCount: 0 }

    const total = incomes.reduce((s, t) => s + t.transactionValue, 0)

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
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
          Average Income
        </h2>
        {/* Info tooltip */}
        <div className="relative group">
          <svg
            className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 cursor-help"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
              clipRule="evenodd"
            />
          </svg>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
            <div
              className="text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap"
              style={{
                backgroundColor: 'var(--bg-sidebar)',
                color: 'var(--text-secondary, #6b7280)',
                border: '1px solid var(--border)',
              }}
            >
              All transactions with a positive value are classified as income.
              <div
                className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
                style={{
                  backgroundColor: 'var(--bg-sidebar)',
                  borderRight: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border)',
                }}
              />
            </div>
          </div>
        </div>
      </div>
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

        <div className="font-mono text-3xl font-medium text-green-600 dark:text-green-400">{fmt.format(avg)}</div>
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          avg per {period === 'daily' ? 'day' : period === 'weekly' ? 'week' : 'month'}
          {' · '}
          {periodCount} {period === 'daily' ? 'days' : period === 'weekly' ? 'weeks' : 'months'} of data
        </div>
      </div>
    </section>
  )
}
