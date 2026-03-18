import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/db'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  XAxis,
  YAxis,
} from 'recharts'

const fmt = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' })

function formatMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-')
  const d = new Date(Number(year), Number(month) - 1, 1)
  return d.toLocaleDateString('en-SG', { month: 'short', year: '2-digit' })
}

export function StatsPage() {
  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])

  if (!transactions || !categories) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 dark:text-gray-500 text-sm">
        Loading…
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500 dark:text-gray-400">
          Import statements to see your spending stats.
        </p>
      </div>
    )
  }

  // Monthly spend (expenses only)
  const monthlyMap = new Map<string, number>()
  for (const t of transactions) {
    if (t.transactionValue >= 0) continue
    const month = t.date.slice(0, 7)
    monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + Math.abs(t.transactionValue))
  }
  const monthlyData = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month: formatMonth(month), total: Math.round(total * 100) / 100 }))

  // Category donut
  const catMap = new Map<string, number>()
  for (const t of transactions) {
    if (t.transactionValue >= 0) continue
    const catId = t.manualCategory ?? t.category
    if (!catId) continue
    catMap.set(catId, (catMap.get(catId) ?? 0) + Math.abs(t.transactionValue))
  }
  const catData = [...catMap.entries()]
    .map(([id, value]) => {
      const cat = categories.find((c) => c.id === id)
      return { name: cat?.name ?? id, value: Math.round(value * 100) / 100, color: cat?.color ?? '#94a3b8' }
    })
    .sort((a, b) => b.value - a.value)

  return (
    <div className="p-6 space-y-10">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Stats</h1>

      {/* Monthly spend */}
      <section>
        <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-4 uppercase tracking-wide">
          Monthly Spend
        </h2>
        {monthlyData.length === 0 ? (
          <p className="text-sm text-gray-400">No expense data.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: number) => fmt.format(v)} />
              <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* Category donut */}
      <section>
        <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-4 uppercase tracking-wide">
          Spending by Category
        </h2>
        {catData.length === 0 ? (
          <p className="text-sm text-gray-400">No categorised expenses.</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={catData}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={110}
              >
                {catData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => fmt.format(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </section>
    </div>
  )
}
