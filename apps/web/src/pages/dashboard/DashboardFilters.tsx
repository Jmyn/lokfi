import { useDashboard } from './DashboardContext'

const inputCls =
  'text-xs border rounded-full px-3 py-1.5 bg-white dark:bg-gray-900 text-gray-900 dark:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0'

const inputStyle = { borderColor: 'var(--border)' }

const PRESETS: { label: string; from: () => string; to: () => string }[] = [
  {
    label: 'This month',
    from: () => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    },
    to: () => '',
  },
  {
    label: 'Last 3m',
    from: () => {
      const d = new Date()
      d.setMonth(d.getMonth() - 3)
      return d.toISOString().slice(0, 10)
    },
    to: () => '',
  },
  {
    label: 'Last 6m',
    from: () => {
      const d = new Date()
      d.setMonth(d.getMonth() - 6)
      return d.toISOString().slice(0, 10)
    },
    to: () => '',
  },
  {
    label: 'YTD',
    from: () => `${new Date().getFullYear()}-01-01`,
    to: () => '',
  },
  {
    label: 'All time',
    from: () => '',
    to: () => '',
  },
]

export function DashboardFilters() {
  const { filters, setFilters, categories, allTransactions } = useDashboard()

  const accounts = [...new Set(allTransactions.map((t) => t.accountNo))].sort()

  function toggleCategory(id: string) {
    const next = filters.categoryIds.includes(id)
      ? filters.categoryIds.filter((c) => c !== id)
      : [...filters.categoryIds, id]
    setFilters({ ...filters, categoryIds: next })
  }

  function toggleAccount(acc: string) {
    const next = filters.accounts.includes(acc)
      ? filters.accounts.filter((a) => a !== acc)
      : [...filters.accounts, acc]
    setFilters({ ...filters, accounts: next })
  }

  const allCatsSelected = filters.categoryIds.length === categories.length
  const allAccsSelected = filters.accounts.length === accounts.length

  function resetFilters() {
    setFilters({
      dateFrom: '',
      dateTo: '',
      categoryIds: categories.map((c) => c.id),
      accounts: [...accounts],
    })
  }

  const hasActiveFilters =
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    !allCatsSelected ||
    !allAccsSelected

  return (
    <div
      className="sticky top-0 z-10 flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl border backdrop-blur-sm"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'color-mix(in srgb, var(--bg-sidebar) 85%, transparent)',
      }}
    >
      {/* Date range */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">From</span>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
          className={inputCls}
          style={inputStyle}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">To</span>
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
          className={inputCls}
          style={inputStyle}
        />
      </div>

      {/* Date presets */}
      <div className="flex items-center gap-1">
        {PRESETS.map((p) => {
          const isActive =
            filters.dateFrom === p.from() &&
            filters.dateTo === p.to()
          return (
            <button
              key={p.label}
              onClick={() => setFilters({ ...filters, dateFrom: p.from(), dateTo: p.to() })}
              aria-pressed={isActive}
              className="text-xs rounded-full px-2.5 py-1 border font-medium transition-colors hover:opacity-80"
              style={
                isActive
                  ? {
                      backgroundColor: 'var(--accent)',
                      borderColor: 'var(--accent)',
                      color: '#fff',
                    }
                  : {
                      backgroundColor: 'var(--bg)',
                      borderColor: 'var(--border)',
                    }
              }
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Separator */}
      {categories.length > 0 && (
        <span className="text-gray-300 dark:text-gray-700 select-none">·</span>
      )}

      {/* Category pills */}
      {categories.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Category
            {!allCatsSelected && (
              <span
                className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {filters.categoryIds.length}
              </span>
            )}
          </span>
          {categories.map((cat) => {
            const active = filters.categoryIds.includes(cat.id)
            return (
              <button
                key={cat.id}
                onClick={() => toggleCategory(cat.id)}
                className="text-xs rounded-full px-2.5 py-1 border font-medium transition-all flex items-center gap-1.5"
                style={
                  active
                    ? {
                        backgroundColor: cat.color,
                        borderColor: cat.color,
                        color: '#fff',
                        boxShadow: `0 0 0 2px color-mix(in srgb, ${cat.color} 30%, transparent)`,
                      }
                    : {
                        backgroundColor: 'var(--bg)',
                        borderColor: 'var(--border)',
                      }
                }
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor: active ? '#fff' : cat.color,
                  }}
                />
                {cat.name}
                {active && <span className="text-[10px] leading-none">✓</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Separator */}
      {accounts.length > 0 && (
        <span className="text-gray-300 dark:text-gray-700 select-none">·</span>
      )}

      {/* Account pills */}
      {accounts.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Account
            {!allAccsSelected && (
              <span
                className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {filters.accounts.length}
              </span>
            )}
          </span>
          {accounts.map((acc) => {
            const active = filters.accounts.includes(acc)
            return (
              <button
                key={acc}
                onClick={() => toggleAccount(acc)}
                className="text-xs rounded-full px-2.5 py-1 border font-medium transition-all flex items-center gap-1.5"
                style={
                  active
                    ? {
                        backgroundColor: 'var(--accent)',
                        borderColor: 'var(--accent)',
                        color: '#fff',
                        boxShadow: '0 0 0 2px var(--accent-subtle)',
                      }
                    : { backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }
                }
              >
                {acc}
                {active && <span className="text-[10px] leading-none">✓</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Reset */}
      {hasActiveFilters && (
        <>
          <span className="text-gray-300 dark:text-gray-700 select-none">·</span>
          <button
            onClick={resetFilters}
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
