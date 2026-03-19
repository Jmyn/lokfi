import { useMemo, useState } from 'react'
import { useDashboard } from '../DashboardContext'
import { fmt } from '../../../lib/format'

const CELL = 14
const GAP = 2
const ROWS = 7 // days of week
const MARGIN_LEFT = 28 // space for day labels

function interpolateColor(t: number): string {
  // Interpolate from neutral gray to amber accent based on percentile
  // t is 0..1
  if (t === 0) return 'var(--border)'
  const r = Math.round(217 + (217 - 217) * t) // stays ~217
  const g = Math.round(217 + (119 - 217) * t) // 217 → 119
  const b = Math.round(217 + (6 - 217) * t)   // 217 → 6
  return `rgb(${r}, ${g}, ${b})`
}

interface TooltipData {
  date: string
  amount: number
  x: number
  y: number
}

export function SpendingHeatmap() {
  const { transactions, filters } = useDashboard()
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)

  const { cells, weeks, maxSpend, monthLabels } = useMemo(() => {
    // Determine date range: use filter dates or default to last 6 months
    const today = new Date()
    let endDate = filters.dateTo ? new Date(filters.dateTo) : today
    let startDate = filters.dateFrom
      ? new Date(filters.dateFrom)
      : new Date(today.getFullYear(), today.getMonth() - 6, today.getDate())

    // Align start to Sunday
    const startDay = startDate.getDay()
    startDate = new Date(startDate)
    startDate.setDate(startDate.getDate() - startDay)

    // Build daily spend map
    const dailySpend = new Map<string, number>()
    for (const t of transactions) {
      if (t.transactionValue >= 0) continue
      const key = t.date
      dailySpend.set(key, (dailySpend.get(key) ?? 0) + Math.abs(t.transactionValue))
    }

    // Generate cells
    const cellList: { date: string; amount: number; col: number; row: number }[] = []
    const d = new Date(startDate)
    let col = 0
    let max = 0

    while (d <= endDate) {
      const dateStr = d.toISOString().slice(0, 10)
      const row = d.getDay()
      if (row === 0 && cellList.length > 0) col++
      const amount = dailySpend.get(dateStr) ?? 0
      if (amount > max) max = amount
      cellList.push({ date: dateStr, amount, col, row })
      d.setDate(d.getDate() + 1)
    }

    // Month labels
    const labels: { label: string; col: number }[] = []
    let lastMonth = ''
    for (const cell of cellList) {
      const month = cell.date.slice(0, 7)
      if (month !== lastMonth && cell.row === 0) {
        const dt = new Date(cell.date)
        labels.push({
          label: dt.toLocaleDateString('en-SG', { month: 'short' }),
          col: cell.col,
        })
        lastMonth = month
      }
    }

    return { cells: cellList, weeks: col + 1, maxSpend: max, monthLabels: labels }
  }, [transactions, filters.dateFrom, filters.dateTo])

  if (cells.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
          Spending Heatmap
        </h2>
        <p className="text-sm text-gray-400">No expense data for the selected period.</p>
      </section>
    )
  }

  const svgWidth = MARGIN_LEFT + weeks * (CELL + GAP)
  const svgHeight = 20 + ROWS * (CELL + GAP)

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        Spending Heatmap
      </h2>
      <div
        className="rounded-xl border p-5 overflow-x-auto relative"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <svg width={svgWidth} height={svgHeight}>
          {/* Day-of-week labels */}
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, i) =>
            i % 2 === 1 ? (
              <text
                key={i}
                x={10}
                y={20 + i * (CELL + GAP) + CELL - 3}
                className="text-[9px]"
                fill="#9ca3af"
                textAnchor="middle"
              >
                {label}
              </text>
            ) : null,
          )}
          {/* Month labels */}
          {monthLabels.map((m, i) => (
            <text
              key={i}
              x={MARGIN_LEFT + m.col * (CELL + GAP)}
              y={12}
              className="text-[9px]"
              fill="#9ca3af"
            >
              {m.label}
            </text>
          ))}
          {/* Cells */}
          {cells.map((cell, i) => {
            const pct = maxSpend > 0 ? cell.amount / maxSpend : 0
            return (
              <rect
                key={i}
                x={MARGIN_LEFT + cell.col * (CELL + GAP)}
                y={20 + cell.row * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={3}
                fill={interpolateColor(pct)}
                className="cursor-pointer"
                style={{ transition: 'fill 0.2s' }}
                onMouseEnter={(e) => {
                  const rect = (e.target as SVGRectElement).getBoundingClientRect()
                  setTooltip({
                    date: cell.date,
                    amount: cell.amount,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                  })
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            )
          })}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="fixed z-50 rounded-lg border px-3 py-2 text-xs font-mono pointer-events-none"
            style={{
              left: tooltip.x,
              top: tooltip.y - 40,
              transform: 'translateX(-50%)',
              borderColor: 'var(--border)',
              backgroundColor: 'var(--bg)',
              color: 'var(--tw-text-opacity, currentColor)',
            }}
          >
            <div className="text-gray-500">{tooltip.date}</div>
            <div className="font-medium">{fmt.format(tooltip.amount)}</div>
          </div>
        )}
      </div>
    </section>
  )
}
