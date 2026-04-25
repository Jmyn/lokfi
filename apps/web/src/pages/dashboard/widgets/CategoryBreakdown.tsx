import { useMemo } from 'react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { CATEGORY_PALETTE } from '../../../lib/charts/chartPalette'
import { LEGEND_STYLE, TOOLTIP_STYLE } from '../../../lib/charts/chartTheme'
import { fmt } from '../../../lib/format'
import { useDashboard } from '../DashboardContext'

export function CategoryBreakdown() {
  const { transactions, categories } = useDashboard()

  const catData = useMemo(() => {
    const catMap = new Map<string, number>()
    for (const t of transactions) {
      if (t.transactionValue >= 0) continue
      const catId = t.manualCategory ?? t.category
      if (!catId) continue
      catMap.set(catId, (catMap.get(catId) ?? 0) + Math.abs(t.transactionValue))
    }
    return [...catMap.entries()]
      .map(([id, value], i) => {
        const cat = categories.find((c) => c.id === id)
        return {
          name: cat?.name ?? id,
          value: Math.round(value * 100) / 100,
          color: cat?.color ?? CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
        }
      })
      .sort((a, b) => b.value - a.value)
  }, [transactions, categories])

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        Spending by Category
      </h2>
      {catData.length === 0 ? (
        <div
          className="rounded-xl border px-5 py-10 text-center"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
        >
          <p className="text-sm text-gray-400">No categorised expenses yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Use Rules or click <span style={{ color: 'var(--accent)' }}>+ Categorise</span> on transactions.
          </p>
        </div>
      ) : (
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
        >
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={catData} dataKey="value" nameKey="name" innerRadius={65} outerRadius={110} paddingAngle={2}>
                {catData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip formatter={(v: number, name: string) => [fmt.format(v), name]} contentStyle={TOOLTIP_STYLE} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={LEGEND_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
