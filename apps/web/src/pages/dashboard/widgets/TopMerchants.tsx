import { useMemo } from 'react'
import { useDashboard } from '../DashboardContext'
import { fmt } from '../../../lib/format'

// Noise words to strip from descriptions when extracting merchant names
// Reuses the same set from suggestRules.ts conceptually
const NOISE = new Set([
  'POS', 'IBG', 'PURCHASE', 'DEBIT', 'CREDIT', 'TRANSFER',
  'PAYMENT', 'TRF', 'CR', 'DR', 'REF',
  'NETS', 'NETSQR', 'PAYNOW', 'PAYLAH', 'GIRO', 'ATM',
  'VISA', 'MASTERCARD', 'CONTACTLESS', 'CARDLESS',
  'INTERBANK', 'OVERSEAS', 'FAST',
])

function extractMerchant(description: string): string {
  // Try "to [MERCHANT]" pattern first
  const toMatch = description.match(/\bto\s+(.+?)(?=\s*via\b|$)/i)
  if (toMatch) {
    const merchant = toMatch[1].replace(/\s+/g, ' ').trim()
    if (merchant.length >= 3) return merchant
  }

  // Strip noise prefixes, then take text before first numeric reference
  const tokens = description.split(/[\s\-\/]+/)
  const meaningful: string[] = []
  let pastNoise = false

  for (const token of tokens) {
    const upper = token.toUpperCase().replace(/[^A-Z]/g, '')
    if (!pastNoise && NOISE.has(upper)) continue
    if (/^\d{4,}$/.test(token)) break // stop at reference numbers
    pastNoise = true
    meaningful.push(token)
  }

  const result = meaningful.join(' ').replace(/\s+/g, ' ').trim()
  return result.length >= 3 ? result : description.slice(0, 30).trim()
}

interface MerchantData {
  name: string
  total: number
  count: number
}

export function TopMerchants() {
  const { transactions } = useDashboard()

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
    return [...map.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
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
            <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white truncate relative">
              {m.name}
            </span>
            <span className="text-xs text-gray-400 relative">{m.count} txn{m.count !== 1 ? 's' : ''}</span>
            <span className="font-mono text-sm font-medium text-gray-900 dark:text-white relative">
              {fmt.format(m.total)}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
