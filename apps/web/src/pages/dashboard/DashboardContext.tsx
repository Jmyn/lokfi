import { useLiveQuery } from 'dexie-react-hooks'
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { type DbBudget, type DbTransaction, db } from '../../lib/db/db'
import type { DbCategory } from '../../lib/db/seedCategories'

export interface DashboardFilters {
  dateFrom: string
  dateTo: string
  categoryIds: string[]
  accounts: string[]
}

export const defaultDashboardFilters: DashboardFilters = {
  dateFrom: '',
  dateTo: '',
  categoryIds: [],
  accounts: [],
}

// Persisted subset — only category/account selections are saved (dates are temporal)
interface SavedFilterPrefs {
  categoryIds: string[]
  accounts: string[]
}

const SETTINGS_KEY = 'dashboard-filters'

async function loadSavedPrefs(): Promise<SavedFilterPrefs | null> {
  const row = await db.settings.get(SETTINGS_KEY)
  if (!row) return null
  try {
    return JSON.parse(row.value) as SavedFilterPrefs
  } catch {
    return null
  }
}

function savePrefs(prefs: SavedFilterPrefs): void {
  db.settings.put({ key: SETTINGS_KEY, value: JSON.stringify(prefs) })
}

interface DashboardContextValue {
  filters: DashboardFilters
  setFilters: (f: DashboardFilters) => void
  transactions: DbTransaction[]
  allTransactions: DbTransaction[]
  categories: DbCategory[]
  budgets: DbBudget[]
  isLoading: boolean
}

const DashboardCtx = createContext<DashboardContextValue | null>(null)

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardCtx)
  if (!ctx) throw new Error('useDashboard must be used within DashboardFilterProvider')
  return ctx
}

export function DashboardFilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFiltersRaw] = useState<DashboardFilters>(defaultDashboardFilters)

  const allTransactions = useLiveQuery(() => db.transactions.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const budgets = useLiveQuery(() => db.budgets.toArray(), [])

  // Persist category/account selections when they change (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setFilters = useCallback((next: DashboardFilters) => {
    setFiltersRaw(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      savePrefs({ categoryIds: next.categoryIds, accounts: next.accounts })
    }, 400)
  }, [])

  // On mount: load saved prefs, or fall back to "all selected"
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || !allTransactions || !categories) return
    seeded.current = true

    const allAccounts = [...new Set(allTransactions.map((t) => t.accountNo))].sort()
    const allCatIds = categories.map((c) => c.id)

    loadSavedPrefs().then((saved) => {
      if (saved) {
        // Reconcile: keep only IDs that still exist (categories/accounts may have changed)
        const validCats = saved.categoryIds.filter((id) => allCatIds.includes(id))
        const validAccs = saved.accounts.filter((a) => allAccounts.includes(a))
        setFiltersRaw((prev) => ({
          ...prev,
          categoryIds: validCats.length > 0 ? validCats : allCatIds,
          accounts: validAccs.length > 0 ? validAccs : allAccounts,
        }))
      } else {
        setFiltersRaw((prev) => ({
          ...prev,
          categoryIds: allCatIds,
          accounts: allAccounts,
        }))
      }
    })
  }, [allTransactions, categories])

  // allSelected flags: when every option is selected, skip filtering for that dimension
  // (so uncategorised transactions still appear when all categories are toggled on)
  const allCategoriesSelected = categories ? filters.categoryIds.length === categories.length : true
  const allAccountsSelected = allTransactions
    ? filters.accounts.length === [...new Set(allTransactions.map((t) => t.accountNo))].length
    : true

  const transactions = useMemo(() => {
    if (!allTransactions) return []
    return allTransactions.filter((t) => {
      if (filters.dateFrom && t.date < filters.dateFrom) return false
      if (filters.dateTo && t.date > filters.dateTo) return false
      if (!allAccountsSelected && !filters.accounts.includes(t.accountNo)) return false
      if (!allCategoriesSelected) {
        const catId = t.manualCategory ?? t.category ?? ''
        if (!filters.categoryIds.includes(catId)) return false
      }
      return true
    })
  }, [allTransactions, filters, allCategoriesSelected, allAccountsSelected])

  const isLoading = !allTransactions || !categories || !budgets

  const value: DashboardContextValue = {
    filters,
    setFilters,
    transactions: transactions ?? [],
    allTransactions: allTransactions ?? [],
    categories: categories ?? [],
    budgets: budgets ?? [],
    isLoading,
  }

  return <DashboardCtx.Provider value={value}>{children}</DashboardCtx.Provider>
}
