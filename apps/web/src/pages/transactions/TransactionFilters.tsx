import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/db'
import type { StatementSource } from '@lokfi/parser-core'

export interface Filters {
  dateFrom: string
  dateTo: string
  sources: StatementSource[]
  categoryId: string
}

export const defaultFilters: Filters = {
  dateFrom: '',
  dateTo: '',
  sources: [],
  categoryId: '',
}

interface TransactionFiltersProps {
  filters: Filters
  onChange: (f: Filters) => void
}

export function TransactionFilters({ filters, onChange }: TransactionFiltersProps) {
  const sources = useLiveQuery(
    () => db.transactions.orderBy('source').uniqueKeys() as Promise<StatementSource[]>,
    []
  )
  const categories = useLiveQuery(() => db.categories.toArray(), [])

  function toggleSource(source: StatementSource) {
    const next = filters.sources.includes(source)
      ? filters.sources.filter((s) => s !== source)
      : [...filters.sources, source]
    onChange({ ...filters, sources: next })
  }

  return (
    <div className="flex flex-wrap gap-4 p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
      {/* Date range */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">From</label>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
          className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">To</label>
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
          className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
      </div>

      {/* Source checkboxes */}
      {sources && sources.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Source</span>
          {sources.map((source) => (
            <label key={source} className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.sources.includes(source)}
                onChange={() => toggleSource(source)}
                className="rounded"
              />
              <span className="text-xs text-gray-700 dark:text-gray-300">{source}</span>
            </label>
          ))}
        </div>
      )}

      {/* Category */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Category</label>
        <select
          value={filters.categoryId}
          onChange={(e) => onChange({ ...filters, categoryId: e.target.value })}
          className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        >
          <option value="">All</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Reset */}
      <button
        onClick={() => onChange(defaultFilters)}
        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
      >
        Reset
      </button>
    </div>
  )
}
