import { useMemo } from 'react'
import { fmt } from '../../../lib/format'
import { extractMerchant } from '../../../lib/merchantDescription'
import { useFinances } from '../FinancesContext'

interface MerchantData {
  name: string
  total: number
  count: number
}

export function TopMerchants() {
  const { transactions } = useFinances()

  const merchants = useMemo(() => {
    const map = new Map<string, MerchantData>()
    for (const t of transactions) {
      if (t.transactionValue >= 0) continue
      const name = extractMerchant(t.description)
      const key = name.toUpperCase()
      const existing = map.get(key)
      if (existing) {
        existing.total += Math.abs(t.transactionValue)
        existing.count++
      } else {
        map.set(key, { name, total: Math.abs(t.transactionValue), count: 1 })
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 10)
  }, [transactions])

  if (merchants.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
          Top Merchants
        </h2>
        <p className="text-sm text-gray-400">No expense data.</p>
      </section>
    )
  }

  const maxTotal = merchants[0]?.total ?? 1

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        Top Merchants
      </h2>
      <div
        className="rounded-xl border divide-y"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        {merchants.map((m, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-5 py-3 relative overflow-hidden"
            style={{ borderColor: 'var(--border)' }}
          >
            {/* Background bar */}
            <div
              className="absolute inset-y-0 left-0 opacity-[0.06]"
              style={{
                width: `${(m.total / maxTotal) * 100}%`,
                backgroundColor: 'var(--accent)',
              }}
            />

            <span className="font-mono text-xs text-gray-400 w-5 text-right relative">{i + 1}</span>
            <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white truncate relative">{m.name}</span>
            <span className="text-xs text-gray-400 relative">
              {m.count} txn{m.count !== 1 ? 's' : ''}
            </span>
            <span className="font-mono text-sm font-medium text-gray-900 dark:text-white relative">
              {fmt.format(m.total)}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
