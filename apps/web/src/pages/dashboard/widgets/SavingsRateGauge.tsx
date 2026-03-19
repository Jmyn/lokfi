import { useMemo } from 'react'
import { useDashboard } from '../DashboardContext'
import { fmt } from '../../../lib/format'

export function SavingsRateGauge() {
  const { transactions } = useDashboard()

  const { rate, totalIncome, totalExpenses, color, label } = useMemo(() => {
    let income = 0
    let expenses = 0
    for (const t of transactions) {
      if (t.transactionValue > 0) income += t.transactionValue
      else expenses += Math.abs(t.transactionValue)
    }

    if (income === 0) {
      return {
        rate: -1,
        totalIncome: 0,
        totalExpenses: expenses,
        color: '#9ca3af',
        label: 'N/A',
      }
    }

    const r = ((income - expenses) / income) * 100
    const clamped = Math.max(0, Math.min(100, r))
    const c = clamped < 20 ? '#ef4444' : clamped < 50 ? '#f59e0b' : '#16a34a'

    return {
      rate: clamped,
      totalIncome: income,
      totalExpenses: expenses,
      color: c,
      label: `${r.toFixed(1)}%`,
    }
  }, [transactions])

  // SVG half-circle arc
  const cx = 120
  const cy = 110
  const r = 85
  const arcLength = Math.PI * r // half-circle circumference
  const filled = rate >= 0 ? (rate / 100) * arcLength : 0

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        Savings Rate
      </h2>
      <div
        className="rounded-xl border p-5 flex flex-col items-center"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <svg width="240" height="140" viewBox="0 0 240 140">
          {/* Background arc */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="var(--border)"
            strokeWidth="14"
            strokeLinecap="round"
          />
          {/* Filled arc */}
          {rate >= 0 && (
            <path
              d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
              fill="none"
              stroke={color}
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${arcLength}`}
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
          )}
          {/* Center label */}
          <text
            x={cx}
            y={cy - 15}
            textAnchor="middle"
            className="text-3xl font-mono font-medium"
            fill={color}
          >
            {label}
          </text>
          <text
            x={cx}
            y={cy + 5}
            textAnchor="middle"
            className="text-xs"
            fill="#9ca3af"
          >
            savings rate
          </text>
        </svg>

        <div className="flex gap-6 text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span>
            Income: <span className="font-mono text-gray-700 dark:text-gray-300">{fmt.format(totalIncome)}</span>
          </span>
          <span>
            Spent: <span className="font-mono text-gray-700 dark:text-gray-300">{fmt.format(totalExpenses)}</span>
          </span>
        </div>
      </div>
    </section>
  )
}
