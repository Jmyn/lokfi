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

// Warm editorial palette — amber-led
const CATEGORY_PALETTE = [
  '#d97706', // amber
  '#0d9488', // teal
  '#e11d48', // rose
  '#7c3aed', // violet
  '#0284c7', // sky
  '#16a34a', // green
  '#ea580c', // orange
  '#6366f1', // indigo
  '#db2777', // pink
  '#0891b2', // cyan
]

function formatMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-')
  const d = new Date(Number(year), Number(month) - 1, 1)
  return d.toLocaleDateString('en-SG', { month: 'short', year: '2-digit' })
}

interface KpiCardProps {
  label: string
  value: string
  sub?: string
}

function KpiCard({ label, value, sub }: KpiCardProps) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl border p-5"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <span className="font-mono text-2xl font-medium text-gray-900 dark:text-white">{value}</span>
      {sub && <span className="text-xs text-gray-400 dark:text-gray-500">{sub}</span>}
    </div>
  )
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
    .map(([id, value], i) => {
      const cat = categories.find((c) => c.id === id)
      return {
        name: cat?.name ?? id,
        value: Math.round(value * 100) / 100,
        color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
      }
    })
    .sort((a, b) => b.value - a.value)

  // KPIs
  const totalSpend = monthlyData.reduce((s, m) => s + m.total, 0)
  const avgMonthly = monthlyData.length > 0 ? totalSpend / monthlyData.length : 0
  const topCategory = catData[0]
  const uncategorisedCount = transactions.filter(
    (t) => t.transactionValue < 0 && !t.manualCategory && !t.category
  ).length

  return (
    <div className="p-6 space-y-8 max-w-5xl">
      <h1 className="font-serif text-2xl text-gray-900 dark:text-white">Stats</h1>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          label="Total spent"
          value={fmt.format(totalSpend)}
          sub={`across ${monthlyData.length} months`}
        />
        <KpiCard
          label="Monthly average"
          value={fmt.format(avgMonthly)}
          sub="expenses only"
        />
        <KpiCard
          label="Top category"
          value={topCategory?.name ?? '—'}
          sub={topCategory ? fmt.format(topCategory.value) : 'No categories yet'}
        />
      </div>

      {/* Uncategorised nudge */}
      {uncategorisedCount > 0 && (
        <div
          className="rounded-lg border px-4 py-3 text-sm flex items-center gap-2"
          style={{
            borderColor: 'var(--accent)',
            backgroundColor: 'var(--accent-subtle)',
            color: 'var(--accent-text)',
          }}
        >
          <span className="font-semibold">{uncategorisedCount} uncategorised expenses</span>
          <span>—</span>
          <span>add rules on the Rules page for richer category data.</span>
        </div>
      )}

      {/* Monthly spend */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
          Monthly Spend
        </h2>
        {monthlyData.length === 0 ? (
          <p className="text-sm text-gray-400">No expense data.</p>
        ) : (
          <div
            className="rounded-xl border p-5"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
          >
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fontFamily: 'DM Mono', fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fontFamily: 'DM Mono', fill: '#9ca3af' }}
                  tickFormatter={(v) => `$${v}`}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: number) => [fmt.format(v), 'Spend']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg)',
                    fontFamily: 'DM Mono',
                    fontSize: '12px',
                  }}
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                />
                <Bar dataKey="total" fill="#d97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Category donut */}
      <section className="space-y-4">
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
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={catData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={75}
                  outerRadius={130}
                  paddingAngle={2}
                >
                  {catData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => [fmt.format(v), '']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg)',
                    fontFamily: 'DM Mono',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '12px', fontFamily: 'DM Sans' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  )
}
