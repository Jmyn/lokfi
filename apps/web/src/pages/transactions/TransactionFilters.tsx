import { useLiveQuery } from 'dexie-react-hooks'
import { BROKERAGE_TYPE_LABELS } from '../../lib/brokerage/unifiedTransactions'
import { db } from '../../lib/db/db'

import { type Filters, defaultFilters } from './filterTypes'

interface TransactionFiltersProps {
  filters: Filters
  onChange: (f: Filters) => void
}

const inputCls =
  'text-xs border rounded-full px-3 py-1.5 bg-white dark:bg-gray-900 text-gray-900 dark:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0'

const inputStyle = { borderColor: 'var(--border)' }

export function TransactionFilters({ filters, onChange }: TransactionFiltersProps) {
  const allSources = useLiveQuery(async () => {
    if (filters.sourceType === 'bank') {
      return (await db.transactions.orderBy('source').uniqueKeys()) as string[]
    }
    if (filters.sourceType === 'brokerage') {
      const txnSources = (await db.brokerageTransactions.orderBy('source').uniqueKeys()) as string[]
      const fdSources = (await db.brokerageFundDetails.orderBy('source').uniqueKeys()) as string[]
      return Array.from(new Set([...txnSources, ...fdSources]))
    }
    // all
    const bankSources = (await db.transactions.orderBy('source').uniqueKeys()) as string[]
    const txnSources = (await db.brokerageTransactions.orderBy('source').uniqueKeys()) as string[]
    const fdSources = (await db.brokerageFundDetails.orderBy('source').uniqueKeys()) as string[]
    return Array.from(new Set([...bankSources, ...txnSources, ...fdSources]))
  }, [filters.sourceType])

  const accounts = useLiveQuery(() => db.transactions.orderBy('accountNo').uniqueKeys() as Promise<string[]>, [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])

  function toggleSource(source: string) {
    const next = filters.sources.includes(source)
      ? filters.sources.filter((s) => s !== source)
      : [...filters.sources, source]
    onChange({ ...filters, sources: next })
  }

  function toggleAccount(account: string) {
    const next = filters.accounts.includes(account)
      ? filters.accounts.filter((a) => a !== account)
      : [...filters.accounts, account]
    onChange({ ...filters, accounts: next, noAccounts: undefined })
  }

  const hasActiveFilters =
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.sources.length > 0 ||
    filters.accounts.length > 0 ||
    !!filters.noAccounts ||
    filters.categoryId !== '' ||
    filters.type !== '' ||
    !!filters.description ||
    filters.categoryIds !== undefined ||
    !!filters.excludedCategoryIds?.length ||
    !!filters.excludeTransfers ||
    !!filters.excludeInvestments ||
    !!filters.resultRowIds

  const showCategory = filters.sourceType !== 'brokerage'
  const showType = filters.sourceType !== 'bank'
  const showAccounts = filters.sourceType !== 'brokerage'

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
      <input
        type="search"
        aria-label="Filter by description"
        placeholder="Description"
        value={filters.description ?? ''}
        onChange={(e) => onChange({ ...filters, description: e.target.value })}
        className={`${inputCls} w-32`}
        style={inputStyle}
      />
      {filters.resultRowIds && (
        <button
          type="button"
          aria-label="Clear Ask Lokfi result filter"
          onClick={() => onChange({ ...filters, resultRowIds: undefined })}
          className={inputCls}
          style={inputStyle}
        >
          Ask Lokfi results · {filters.resultRowIds.size} ×
        </button>
      )}
      {filters.excludeTransfers && (
        <button
          type="button"
          aria-label="Clear transfers and card repayments exclusion"
          onClick={() => onChange({ ...filters, excludeTransfers: undefined })}
          className={inputCls}
          style={inputStyle}
        >
          Exclude transfers and card repayments ×
        </button>
      )}
      {filters.excludeInvestments && (
        <button
          type="button"
          aria-label="Clear investments and brokerage funding exclusion"
          onClick={() => onChange({ ...filters, excludeInvestments: undefined })}
          className={inputCls}
          style={inputStyle}
        >
          Exclude investments and brokerage funding ×
        </button>
      )}
      {filters.excludedCategoryIds?.map((id) => {
        const name =
          id === '__uncategorised__' ? 'Uncategorised' : categories?.find((category) => category.id === id)?.name
        if (!name) return null
        return (
          <button
            key={id}
            type="button"
            aria-label={`Clear ${name} exclusion`}
            onClick={() =>
              onChange({
                ...filters,
                excludedCategoryIds: filters.excludedCategoryIds?.filter((value) => value !== id),
              })
            }
            className={inputCls}
            style={inputStyle}
          >
            Exclude {name} ×
          </button>
        )
      })}

      {/* Source pills */}
      {allSources && allSources.length > 0 && (
        <>
          <span className="text-gray-300 dark:text-gray-700 select-none">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Source</span>
            {allSources.map((source) => {
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
        </>
      )}

      {/* Account pills */}
      {showAccounts && accounts && accounts.length > 0 && (
        <>
          <span className="text-gray-300 dark:text-gray-700 select-none">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Account</span>
            {filters.noAccounts && (
              <button
                type="button"
                className={inputCls}
                onClick={() => onChange({ ...filters, noAccounts: undefined })}
              >
                No accounts selected ×
              </button>
            )}
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
        </>
      )}

      {/* Category */}
      {showCategory && (
        <>
          <span className="text-gray-300 dark:text-gray-700 select-none">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Category</span>
            <select
              aria-label="Transaction category filter"
              value={filters.categoryIds ? '__multiple__' : filters.categoryId}
              onChange={(e) => onChange({ ...filters, categoryId: e.target.value, categoryIds: undefined })}
              className={inputCls}
              style={inputStyle}
            >
              <option value="">All</option>
              {filters.categoryIds && (
                <option value="__multiple__" disabled>
                  {filters.categoryIds.length ? `${filters.categoryIds.length} selected` : 'None selected'}
                </option>
              )}
              <option value="__uncategorised__">Uncategorised</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Type */}
      {showType && (
        <>
          <span className="text-gray-300 dark:text-gray-700 select-none">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Type</span>
            <select
              value={filters.type}
              onChange={(e) => onChange({ ...filters, type: e.target.value })}
              className={inputCls}
              style={inputStyle}
            >
              <option value="">All</option>
              {Object.entries(BROKERAGE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

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
