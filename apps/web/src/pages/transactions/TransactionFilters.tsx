import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/db'
import type { StatementSource } from '@lokfi/parser-core'

import { type Filters, defaultFilters } from './filterTypes'

interface TransactionFiltersProps {
  filters: Filters
  onChange: (f: Filters) => void
}

const inputCls =
  'text-xs border rounded-full px-3 py-1.5 bg-white dark:bg-gray-900 text-gray-900 dark:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0'

const inputStyle = { borderColor: 'var(--border)' }

export function TransactionFilters({ filters, onChange }: TransactionFiltersProps) {
  const sources = useLiveQuery(
    () => db.transactions.orderBy('source').uniqueKeys() as Promise<StatementSource[]>,
    []
  )
  const accounts = useLiveQuery(
    () => db.transactions.orderBy('accountNo').uniqueKeys() as Promise<string[]>,
    []
  )
  const categories = useLiveQuery(() => db.categories.toArray(), [])

  function toggleSource(source: StatementSource) {
    const next = filters.sources.includes(source)
      ? filters.sources.filter((s) => s !== source)
      : [...filters.sources, source]
    onChange({ ...filters, sources: next })
  }

  function toggleAccount(account: string) {
    const next = filters.accounts.includes(account)
      ? filters.accounts.filter((a) => a !== account)
      : [...filters.accounts, account]
    onChange({ ...filters, accounts: next })
  }

  const hasActiveFilters =
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.sources.length > 0 ||
    filters.accounts.length > 0 ||
    filters.categoryId !== ''

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-4 py-3 border-b"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
    >
      {/* Date range */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">From</span>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
          className={inputCls}
          style={inputStyle}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">To</span>
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
          className={inputCls}
          style={inputStyle}
        />
      </div>

      {/* Separator */}
      {sources && sources.length > 0 && (
        <span className="text-gray-300 dark:text-gray-700 select-none">·</span>
      )}

      {/* Source pills */}
      {sources && sources.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Source</span>
          {sources.map((source) => {
            const active = filters.sources.includes(source)
            return (
              <button
                key={source}
                onClick={() => toggleSource(source)}
                className="text-xs rounded-full px-3 py-1.5 border font-medium transition-colors"
                style={
                  active
                    ? {
                        backgroundColor: 'var(--accent)',
                        borderColor: 'var(--accent)',
                        color: '#fff',
                      }
                    : {
                        backgroundColor: 'var(--bg)',
                        borderColor: 'var(--border)',
                        color: 'var(--tw-text-opacity, currentColor)',
                      }
                }
              >
                {source}
              </button>
            )
          })}
        </div>
      )}

      {/* Separator */}
      {(sources?.length || 0) > 0 || (accounts?.length || 0) > 0 ? (
        <span className="text-gray-300 dark:text-gray-700 select-none">·</span>
      ) : null}

      {/* Account pills */}
      {accounts && accounts.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Account</span>
          {accounts.map((account) => {
            const active = filters.accounts.includes(account)
            return (
              <button
                key={account}
                onClick={() => toggleAccount(account)}
                className="text-xs rounded-full px-3 py-1.5 border font-medium transition-colors"
                style={
                  active
                    ? {
                        backgroundColor: 'var(--accent)',
                        borderColor: 'var(--accent)',
                        color: '#fff',
                      }
                    : {
                        backgroundColor: 'var(--bg)',
                        borderColor: 'var(--border)',
                        color: 'var(--tw-text-opacity, currentColor)',
                      }
                }
              >
                {account}
              </button>
            )
          })}
        </div>
      )}

      {/* Separator */}
      <span className="text-gray-300 dark:text-gray-700 select-none">·</span>

      {/* Category */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Category</span>
        <select
          value={filters.categoryId}
          onChange={(e) => onChange({ ...filters, categoryId: e.target.value })}
          className={inputCls}
          style={inputStyle}
        >
          <option value="">All</option>
          <option value="__uncategorised__">Uncategorised</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Reset */}
      {hasActiveFilters && (
        <>
          <span className="text-gray-300 dark:text-gray-700 select-none">·</span>
          <button
            onClick={() => onChange(defaultFilters)}
            className="text-xs font-medium transition-colors hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            Clear filters
          </button>
        </>
      )}
    </div>
  )
}
