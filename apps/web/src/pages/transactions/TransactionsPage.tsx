import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/db'
import { TransactionTable } from './TransactionTable'
import { TransactionFilters } from './TransactionFilters'
import { defaultFilters, type Filters } from './filterTypes'
import { CategoryCombobox } from './CategoryCombobox'

export function TransactionsPage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCategoryId, setBulkCategoryId] = useState('')

  const totalCount = useLiveQuery(() => db.transactions.count(), [])
  const uncategorisedCount = useLiveQuery(async () => {
    const all = await db.transactions.toArray()
    return all.filter((t) => !t.manualCategory && !t.category).length
  }, [])

  const hasFilters =
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.sources.length > 0 ||
    filters.accounts.length > 0 ||
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
        <div className="text-center p-8 rounded-xl border max-w-sm" style={{ borderColor: 'var(--border)' }}>
          <p className="text-gray-600 dark:text-gray-400 mb-4">No transactions yet</p>
          <Link
            to="/import"
            className="text-sm font-medium hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            Import a statement →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3.5 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-baseline gap-3">
          <h1 className="font-serif text-xl text-gray-900 dark:text-white">Transactions</h1>
          {totalCount !== undefined && (
            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{totalCount} total</span>
          )}
        </div>
        {/* Uncategorised nudge */}
        {uncategorisedCount !== undefined && uncategorisedCount > 0 && (
          <button
            onClick={() =>
              setFilters((f) => ({
                ...f,
                categoryId: f.categoryId === '__uncategorised__' ? '' : '__uncategorised__',
              }))
            }
            className="text-xs font-medium px-3 py-1.5 rounded-full border transition-colors"
            style={{
              color: 'var(--accent)',
              borderColor: 'var(--accent)',
              backgroundColor:
                filters.categoryId === '__uncategorised__' ? 'var(--accent-subtle)' : 'transparent',
            }}
          >
            {uncategorisedCount} uncategorised
          </button>
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
        <div
          className="sticky bottom-0 flex items-center gap-3 px-5 py-3 border-t shadow-lg"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
        >
          <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
            {selectedIds.size} selected · Categorise as:
          </span>
          <CategoryCombobox
            value={bulkCategoryId}
            onChange={setBulkCategoryId}
            placeholder="Pick a category…"
          />
          <button
            onClick={handleBulkApply}
            disabled={!bulkCategoryId}
            className="px-4 py-1.5 text-white text-sm rounded-full font-medium disabled:opacity-40 transition-colors"
            style={{ backgroundColor: 'var(--accent)' }}
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
