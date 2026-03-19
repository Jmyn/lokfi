import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useDashboard } from '../DashboardContext'
import { fmt, formatMonth } from '../../../lib/format'
import { AXIS_TICK, TOOLTIP_STYLE, CURSOR_STYLE } from '../../../lib/charts/chartTheme'

export function MonthlyTrendChart() {
  const { transactions } = useDashboard()

  const data = useMemo(() => {
    const monthMap = new Map<string, { income: number; expenses: number }>()
    for (const t of transactions) {
      const month = t.date.slice(0, 7)
      const entry = monthMap.get(month) ?? { income: 0, expenses: 0 }
      if (t.transactionValue >= 0) {
        entry.income += t.transactionValue
      } else {
        entry.expenses += Math.abs(t.transactionValue)
      }
      monthMap.set(month, entry)
    }
    return [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, vals]) => ({
        month: formatMonth(month),
        income: Math.round(vals.income * 100) / 100,
        expenses: Math.round(vals.expenses * 100) / 100,
      }))
  }, [transactions])

  if (data.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
          Monthly Trend
        </h2>
        <p className="text-sm text-gray-400">No data for the selected period.</p>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        Monthly Trend
      </h2>
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16a34a" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gradExpenses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d97706" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#d97706" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis
              tick={AXIS_TICK}
              tickFormatter={(v) => `$${v}`}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(v: number, name: string) => [fmt.format(v), name === 'income' ? 'Income' : 'Expenses']}
              contentStyle={TOOLTIP_STYLE}
              cursor={CURSOR_STYLE}
            />
            <Area
              type="monotone"
              dataKey="income"
              stroke="#16a34a"
              strokeWidth={2}
              fill="url(#gradIncome)"
            />
            <Area
              type="monotone"
              dataKey="expenses"
              stroke="#d97706"
              strokeWidth={2}
              fill="url(#gradExpenses)"
            />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex items-center justify-center gap-6 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: '#16a34a' }} />
            Income
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: '#d97706' }} />
            Expenses
          </span>
        </div>
      </div>
    </section>
  )
}
