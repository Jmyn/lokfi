import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/db'
import { CategoryBadge } from './CategoryBadge'
import type { Filters } from './TransactionFilters'

const fmt = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' })

interface TransactionTableProps {
  filters: Filters
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleAll: (ids: string[]) => void
}

export function TransactionTable({
  filters,
  selectedIds,
  onToggleSelect,
  onToggleAll,
}: TransactionTableProps) {
  const transactions = useLiveQuery(async () => {
    const all = await db.transactions.orderBy('date').reverse().toArray()

    return all.filter((t) => {
      if (filters.dateFrom && t.date < filters.dateFrom) return false
      if (filters.dateTo && t.date > filters.dateTo) return false
      if (filters.sources.length > 0 && !filters.sources.includes(t.source)) return false
      if (filters.categoryId) {
        const resolved = t.manualCategory ?? t.category
        if (resolved !== filters.categoryId) return false
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
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
            <th className="w-10 px-3 py-2 text-left">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onToggleAll(allIds)}
                className="rounded"
              />
            </th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Date</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Description</th>
            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400">Amount</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Category</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Source</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Account</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => {
            const isNeg = t.transactionValue < 0
            const amountStr =
              (isNeg ? '−' : '+') + fmt.format(Math.abs(t.transactionValue))

            return (
              <tr
                key={t.id}
                className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 ${
                  selectedIds.has(t.id) ? 'bg-blue-50 dark:bg-blue-950' : ''
                }`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(t.id)}
                    onChange={() => onToggleSelect(t.id)}
                    className="rounded"
                  />
                </td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {t.date}
                </td>
                <td className="px-3 py-2 text-gray-900 dark:text-white max-w-xs truncate">
                  {t.description}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono whitespace-nowrap ${
                    isNeg
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-green-600 dark:text-green-400'
                  }`}
                >
                  {amountStr}
                </td>
                <td className="px-3 py-2">
                  <CategoryBadge
                    transactionId={t.id}
                    category={t.category}
                    manualCategory={t.manualCategory}
                  />
                </td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs">{t.source}</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs font-mono">
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
