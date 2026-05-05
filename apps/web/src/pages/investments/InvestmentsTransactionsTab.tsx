import { useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link as LinkIcon } from 'lucide-react'
import { useMemo } from 'react'
import { type UnifiedTransactionRow, fetchUnifiedRows } from '../../lib/brokerage/unifiedTransactions'
import { db } from '../../lib/db/db'
import { defaultFilters } from '../transactions/filterTypes'

// ── Formatting helpers ──────────────────────────────────────────────────────

const fmtCache = new Map<string, Intl.NumberFormat>()
function getFormatter(currency: string): Intl.NumberFormat {
  if (!fmtCache.has(currency)) {
    fmtCache.set(currency, new Intl.NumberFormat('en-US', { style: 'currency', currency }))
  }
  return fmtCache.get(currency)!
}

function formatAmount(row: UnifiedTransactionRow): string {
  const fmt = getFormatter(row.currency)
  const abs = Math.abs(row.amount)
  const sign = row.amount < 0 ? '−' : '+'
  return `${sign}${fmt.format(abs)}`
}

function formatPrice(row: UnifiedTransactionRow): string {
  if (row.price === undefined) return '—'
  const fmt = getFormatter(row.currency)
  return fmt.format(row.price)
}

function amountColorClass(row: UnifiedTransactionRow): string {
  if (row.isBank) {
    return row.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
  }
  switch (row.type) {
    case 'DIVIDEND':
      return 'text-emerald-600 dark:text-emerald-400'
    case 'FEE':
      return 'text-red-600 dark:text-red-400'
    default:
      return 'text-gray-500 dark:text-gray-400'
  }
}

function formatSource(row: UnifiedTransactionRow): string {
  const icon = row.isBank ? '🏦' : '📈'
  return `${icon} ${row.source}`
}

// ── Type badge ──────────────────────────────────────────────────────────────

const typeBadgeClasses: Record<string, string> = {
  BUY: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  SELL: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  DIVIDEND: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  FEE: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  SPLIT: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  RIGHTS: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'CORP ACTION': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  OTHER: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
}

function TypeBadge({ type }: { type: string }) {
  if (type === 'BANK') return <span className="text-gray-400">—</span>
  const cls = typeBadgeClasses[type] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{type}</span>
}

// ── Category display ────────────────────────────────────────────────────────

function CategoryCell({ row }: { row: UnifiedTransactionRow }) {
  if (!row.isBank || !row.originalBank) {
    return <span className="text-gray-400 text-xs">—</span>
  }
  const cat = row.originalBank.manualCategory ?? row.originalBank.category
  return <span className="text-xs text-gray-600 dark:text-gray-400">{cat ?? '—'}</span>
}

// ── Dividend bank linking ────────────────────────────────────────────────────

function useDividendBankLinks(dividendRows: UnifiedTransactionRow[]): Map<string, string> {
  const result = useLiveQuery(async () => {
    const linkMap = new Map<string, string>()
    if (dividendRows.length === 0) return linkMap

    const dividendInfos = await Promise.all(
      dividendRows
        .filter((r) => r.type === 'DIVIDEND')
        .map(async (divRow) => {
          // Only match dividends in SGD (bank transactions are always SGD)
          if (divRow.currency !== 'SGD') return { divRowId: divRow.id, bankId: undefined }

          const divDate = new Date(divRow.date)
          const dateFrom = new Date(divDate)
          dateFrom.setDate(dateFrom.getDate() - 3)
          const dateTo = new Date(divDate)
          dateTo.setDate(dateTo.getDate() + 3)

          const candidates = await db.transactions
            .where('date')
            .between(dateFrom.toISOString().slice(0, 10), dateTo.toISOString().slice(0, 10))
            .toArray()

          const match = candidates.find((t) => {
            return t.transactionValue > 0 && Math.abs(t.transactionValue - divRow.amount) < 0.01 && t.id !== divRow.id
          })

          return { divRowId: divRow.id, bankId: match?.id }
        })
    )

    for (const { divRowId, bankId } of dividendInfos) {
      if (bankId) linkMap.set(divRowId, bankId)
    }

    return linkMap
  }, [dividendRows])

  return result ?? new Map()
}

// ── Main component ───────────────────────────────────────────────────────────

export function InvestmentsTransactionsTab() {
  const navigate = useNavigate()

  const { rows, total } = useLiveQuery(
    async () => {
      const filters = { ...defaultFilters, sourceType: 'brokerage' as const }
      const result = await fetchUnifiedRows(filters)
      return { rows: result.rows, total: result.total }
    },
    [],
    { rows: [] as UnifiedTransactionRow[], total: 0 }
  )

  const dividendRows = useMemo(() => rows.filter((r) => r.type === 'DIVIDEND'), [rows])
  const dividendBankLinks = useDividendBankLinks(dividendRows)

  if (rows.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">No transactions yet.</p>
        <a
          href="/settings/brokerage"
          className="text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
        >
          Configure brokerage account →
        </a>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto relative">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}>
            <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Date
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Description
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Type
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Symbol
            </th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Quantity
            </th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Price
            </th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Amount
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Source
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Category
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => {
            const isEven = i % 2 === 0
            const linkedBankId = dividendBankLinks.get(t.id)

            return (
              <tr
                key={t.id}
                className="border-b transition-colors"
                style={{
                  borderColor: 'var(--border)',
                  backgroundColor: isEven ? 'var(--bg)' : 'var(--bg-sidebar)',
                }}
              >
                {/* Date */}
                <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono text-xs">
                  {t.date.slice(0, 10)}
                </td>

                {/* Description */}
                <td className="px-3 py-2.5 text-gray-900 dark:text-white max-w-xs">
                  <div className="flex items-center gap-1">
                    <span className="truncate">{t.description}</span>
                    {linkedBankId && (
                      <button
                        onClick={() => navigate({ to: '/transactions' })}
                        className="shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-amber-600 dark:text-amber-400"
                        title="Linked bank deposit"
                      >
                        <LinkIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>

                {/* Type badge */}
                <td className="px-3 py-2.5">
                  <TypeBadge type={t.type} />
                </td>

                {/* Symbol */}
                <td className="px-3 py-2.5 text-xs font-mono text-gray-600 dark:text-gray-400">
                  {!t.isBank && t.symbol ? t.symbol : '—'}
                </td>

                {/* Quantity */}
                <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                  {!t.isBank && (t.type === 'BUY' || t.type === 'SELL') && t.quantity !== undefined
                    ? t.quantity.toString()
                    : '—'}
                </td>

                {/* Price */}
                <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                  {!t.isBank && (t.type === 'BUY' || t.type === 'SELL') ? formatPrice(t) : '—'}
                </td>

                {/* Amount */}
                <td
                  className={`px-3 py-2.5 text-right font-mono whitespace-nowrap text-xs font-medium tabular-nums ${amountColorClass(t)}`}
                >
                  {formatAmount(t)}
                </td>

                {/* Source */}
                <td className="px-3 py-2.5 text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">
                  {formatSource(t)}
                </td>

                {/* Category */}
                <td className="px-3 py-2.5">
                  <CategoryCell row={t} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-t text-xs text-gray-400 dark:text-gray-500"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <span>
          Showing {rows.length} of {total} transactions
        </span>
      </div>
    </div>
  )
}
