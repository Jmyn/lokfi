import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import type { UnifiedTransactionRow } from '../../lib/brokerage/unifiedTransactions'
import type { DbTransaction } from '../../lib/db/db'
import { CategoryBadge } from './CategoryBadge'

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

interface TransactionTableProps {
  rows: UnifiedTransactionRow[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleAll: (ids: string[]) => void
  onCategoryChanged?: (txn: DbTransaction, categoryId: string | undefined) => void
  pageOffset: number
  total: number
  hasMore: boolean
  onLoadMore: () => void
}

export function TransactionTable({
  rows,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onCategoryChanged,
  pageOffset,
  total,
  hasMore,
  onLoadMore,
}: TransactionTableProps) {
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const selectableIds = rows.filter((t) => t.isBank).map((t) => t.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id))

  return (
    <div className="overflow-x-auto relative">
      {editingCategoryId && (
        <div
          className="fixed inset-0 z-40 bg-black/20 dark:bg-black/60 backdrop-blur-sm transition-all"
          aria-hidden="true"
          onClick={() => setEditingCategoryId(null)}
        />
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}>
            <th className="w-10 px-3 py-2.5 text-left">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onToggleAll(selectableIds)}
                className="rounded accent-amber-600"
              />
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Date
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Description
            </th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Amount
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Category
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Source
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Account
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => {
            const isSelected = selectedIds.has(t.id)
            const isEven = i % 2 === 0
            const isEditing = editingCategoryId === t.id

            return (
              <tr
                key={t.id}
                className={`border-b transition-colors ${
                  isEditing ? 'relative z-50 ring-2 ring-amber-500 shadow-xl rounded-md bg-white dark:bg-gray-800' : ''
                }`}
                style={
                  isEditing
                    ? undefined
                    : {
                        borderColor: 'var(--border)',
                        backgroundColor: isSelected
                          ? 'var(--accent-subtle)'
                          : isEven
                            ? 'var(--bg)'
                            : 'var(--bg-sidebar)',
                      }
                }
              >
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={!t.isBank}
                    onChange={() => t.isBank && onToggleSelect(t.id)}
                    className="rounded accent-amber-600 disabled:opacity-30"
                  />
                </td>
                <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono text-xs">
                  {t.date.slice(0, 10)}
                </td>
                <td
                  className={`px-3 py-2.5 text-gray-900 dark:text-white max-w-xs ${isEditing ? 'whitespace-normal break-words' : ''}`}
                >
                  <div className="flex items-center gap-1 group">
                    <span className={isEditing ? '' : 'truncate'}>{t.description}</span>
                    {t.isBank && t.originalBank && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(t.description)
                          setCopiedId(t.id)
                          setTimeout(() => setCopiedId(null), 1500)
                        }}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                        title="Copy description"
                      >
                        {copiedId === t.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-gray-400" />
                        )}
                      </button>
                    )}
                  </div>
                </td>
                <td
                  className={`px-3 py-2.5 text-right font-mono whitespace-nowrap text-xs font-medium tabular-nums ${amountColorClass(t)}`}
                >
                  {formatAmount(t)}
                </td>
                <td className={`px-3 py-2.5 ${isEditing ? 'relative z-50' : ''}`}>
                  {t.isBank && t.originalBank ? (
                    <CategoryBadge
                      transactionId={t.id}
                      category={t.originalBank.category}
                      manualCategory={t.originalBank.manualCategory}
                      isEditing={isEditing}
                      onStartEdit={() => setEditingCategoryId(t.id)}
                      onStopEdit={() => setEditingCategoryId(null)}
                      onCategoryChanged={onCategoryChanged}
                    />
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">
                  {formatSource(t)}
                </td>
                <td className="px-3 py-2.5 text-gray-400 dark:text-gray-500 text-xs font-mono">
                  {t.isBank && t.originalBank ? t.originalBank.accountNo : '—'}
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
          Showing {pageOffset + rows.length} of {total} transactions
        </span>
        {hasMore && (
          <button
            onClick={onLoadMore}
            className="text-xs font-medium px-3 py-1 rounded border transition-colors hover:border-amber-500 hover:text-amber-600"
            style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
          >
            Load more ({total - pageOffset - rows.length} remaining)
          </button>
        )}
      </div>
    </div>
  )
}
