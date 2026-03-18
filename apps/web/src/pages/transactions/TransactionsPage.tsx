import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/db'
import { TransactionTable } from './TransactionTable'
import { TransactionFilters, defaultFilters, type Filters } from './TransactionFilters'

export function TransactionsPage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCategoryId, setBulkCategoryId] = useState('')

  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const totalCount = useLiveQuery(() => db.transactions.count(), [])

  const hasFilters =
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.sources.length > 0 ||
    filters.categoryId !== ''

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleToggleAll(ids: string[]) {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id))
      if (allSelected) return new Set()
      return new Set(ids)
    })
  }

  async function handleBulkApply() {
    if (!bulkCategoryId || selectedIds.size === 0) return
    const ids = [...selectedIds]
    const txns = await db.transactions.bulkGet(ids)
    const updates = txns
      .filter((t): t is NonNullable<typeof t> => t !== undefined)
      .map((t) => ({ ...t, manualCategory: bulkCategoryId }))
    await db.transactions.bulkPut(updates)
    setSelectedIds(new Set())
    setBulkCategoryId('')
  }

  if (totalCount === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8 rounded-xl border border-gray-200 dark:border-gray-800 max-w-sm">
          <p className="text-gray-600 dark:text-gray-400 mb-4">No transactions yet</p>
          <Link
            to="/import"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            Import a statement
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Transactions</h1>
        {totalCount !== undefined && (
          <span className="text-sm text-gray-500 dark:text-gray-400">{totalCount} total</span>
        )}
      </div>

      <TransactionFilters filters={filters} onChange={setFilters} />

      <div className="flex-1 overflow-auto">
        {totalCount === 0 && hasFilters ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              No transactions match your filters.
            </p>
          </div>
        ) : (
          <TransactionTable
            filters={filters}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleAll={handleToggleAll}
          />
        )}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-0 flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 shadow-lg">
          <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
            {selectedIds.size} selected · Categorise as:
          </span>
          <select
            value={bulkCategoryId}
            onChange={(e) => setBulkCategoryId(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">Pick a category…</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleBulkApply}
            disabled={!bulkCategoryId}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Apply
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
