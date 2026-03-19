import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Copy, Check } from 'lucide-react'
import { db } from '../../lib/db/db'
import type { DbTransaction } from '../../lib/db/db'
import { CategoryBadge } from './CategoryBadge'
import type { Filters } from './filterTypes'

const fmt = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' })

interface TransactionTableProps {
  filters: Filters
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleAll: (ids: string[]) => void
  onCategoryChanged?: (txn: DbTransaction, categoryId: string | undefined) => void
}

export function TransactionTable({
  filters,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onCategoryChanged,
}: TransactionTableProps) {
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const transactions = useLiveQuery(async () => {
    const all = await db.transactions.orderBy('date').reverse().toArray()

    return all.filter((t) => {
      if (filters.dateFrom && t.date < filters.dateFrom) return false
      if (filters.dateTo && t.date > filters.dateTo) return false
      if (filters.sources.length > 0 && !filters.sources.includes(t.source)) return false
      if (filters.accounts?.length > 0 && !filters.accounts.includes(t.accountNo)) return false
      if (filters.categoryId) {
        if (filters.categoryId === '__uncategorised__') {
          const resolved = t.manualCategory ?? t.category
          if (resolved) return false
        } else {
          const resolved = t.manualCategory ?? t.category
          if (resolved !== filters.categoryId) return false
        }
      }
      return true
    })
  }, [filters])

  if (!transactions) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 dark:text-gray-500 text-sm">
        Loading…
      </div>
    )
  }

  const allIds = transactions.map((t) => t.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id))

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
          <tr
            className="border-b"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
          >
            <th className="w-10 px-3 py-2.5 text-left">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onToggleAll(allIds)}
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
          {transactions.map((t, i) => {
            const isNeg = t.transactionValue < 0
            const amountStr =
              (isNeg ? '−' : '+') + fmt.format(Math.abs(t.transactionValue))
            const isSelected = selectedIds.has(t.id)
            const isEven = i % 2 === 0

            return (
              <tr
                key={t.id}
                className={`border-b transition-colors ${
                  editingCategoryId === t.id ? 'relative z-50 ring-2 ring-amber-500 shadow-xl rounded-md bg-white dark:bg-gray-800' : ''
                }`}
                style={editingCategoryId === t.id ? undefined : {
                  borderColor: 'var(--border)',
                  backgroundColor: isSelected
                    ? 'var(--accent-subtle)'
                    : isEven
                    ? 'var(--bg)'
                    : 'var(--bg-sidebar)',
                }}
              >
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(t.id)}
                    className="rounded accent-amber-600"
                  />
                </td>
                <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono text-xs">
                  {t.date}
                </td>
                <td className={`px-3 py-2.5 text-gray-900 dark:text-white max-w-xs ${editingCategoryId === t.id ? 'whitespace-normal break-words' : ''}`}>
                  <div className="flex items-center gap-1 group">
                    <span className={editingCategoryId === t.id ? '' : 'truncate'}>{t.description}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(t.description)
                        setCopiedId(t.id)
                        setTimeout(() => setCopiedId(null), 1500)
                      }}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                      title="Copy description"
                    >
                      {copiedId === t.id
                        ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                        : <Copy className="w-3.5 h-3.5 text-gray-400" />
                      }
                    </button>
                  </div>
                </td>
                <td
                  className={`px-3 py-2.5 text-right font-mono whitespace-nowrap text-xs font-medium ${
                    isNeg
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {amountStr}
                </td>
                <td className={`px-3 py-2.5 ${editingCategoryId === t.id ? 'relative z-50' : ''}`}>
                  <CategoryBadge
                    transactionId={t.id}
                    category={t.category}
                    manualCategory={t.manualCategory}
                    isEditing={editingCategoryId === t.id}
                    onStartEdit={() => setEditingCategoryId(t.id)}
                    onStopEdit={() => setEditingCategoryId(null)}
                    onCategoryChanged={onCategoryChanged}
                  />
                </td>
                <td className="px-3 py-2.5 text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">
                  {t.source}
                </td>
                <td className="px-3 py-2.5 text-gray-400 dark:text-gray-500 text-xs font-mono">
                  {t.accountNo}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
