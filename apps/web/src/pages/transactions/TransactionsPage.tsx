import { useState, useRef, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/db'
import type { DbTransaction } from '../../lib/db/db'
import { TransactionTable } from './TransactionTable'
import { TransactionFilters } from './TransactionFilters'
import { defaultFilters, type Filters } from './filterTypes'
import { CategoryCombobox } from './CategoryCombobox'
import { RuleSuggestionBar } from './RuleSuggestionBar'
import { RuleEditorModal } from '../rules/RuleEditorModal'
import { suggestRules, type RuleSuggestion } from '../../lib/rules/suggestRules'
import { applyRulesToImport } from '../../lib/rules/applyRulesToImport'

type SuggestionState = {
  txnId: string
  suggestions: RuleSuggestion[]
  categoryId: string
  categoryName: string
}

export function TransactionsPage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCategoryId, setBulkCategoryId] = useState('')
  const [suggestionState, setSuggestionState] = useState<SuggestionState | null>(null)
  const [customizeRule, setCustomizeRule] = useState<(SuggestionState & { suggestion: RuleSuggestion }) | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const dismissedTxIds = useRef<Set<string>>(new Set())

  // Pagination state
  const [pageOffset, setPageOffset] = useState(0)
  const [filteredTotal, setFilteredTotal] = useState(0)

  // Cache all transactions for suggestRules (only reload when categories/rules change)
  const allTxnsRef = useRef<DbTransaction[]>([])

  // Query categories first so the useEffect below can reference it
  const categories = useLiveQuery(() => db.categories.toArray(), [])

  // Reset page offset when filters change
  useEffect(() => {
    setPageOffset(0)
  }, [filters])

  // Reload all transactions for suggestRules only when categories change
  useEffect(() => {
    db.transactions.toArray().then((txns) => {
      allTxnsRef.current = txns
    })
  }, [categories]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-evaluate rules on mount (handles cleared manual overrides, new rules, etc.)
  useEffect(() => {
    db.transactions.toArray().then((txns) => {
      if (txns.length > 0) {
        applyRulesToImport(txns.map((t) => t.id))
      }
    })
  }, [])

  const totalCount = useLiveQuery(() => db.transactions.count(), [])
  const uncategorisedCount = useLiveQuery(async () => {
    return await db.transactions.filter((t) => !t.manualCategory && !t.category).count()
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

  async function handleCategoryChanged(txn: DbTransaction, categoryId: string | undefined) {
    // Skip if no category was set
    if (!categoryId) return
    // Skip if the transaction already had a rule-assigned category (user is overriding)
    if (txn.category) return
    // A new categorization clears any prior dismiss for this txn
    dismissedTxIds.current.delete(txn.id)

    // Use cached allTransactions (only refreshed when categories change)
    const suggestions = suggestRules(txn, categoryId, allTxnsRef.current)
    if (suggestions.length === 0) return

    const category = categories?.find((c) => c.id === categoryId)
    const categoryName = category?.name ?? categoryId

    setSuggestionState({ txnId: txn.id, suggestions, categoryId, categoryName })
  }

  function handleDismiss() {
    if (suggestionState) dismissedTxIds.current.add(suggestionState.txnId)
    setSuggestionState(null)
  }

  async function handleCreateRule(suggestion: RuleSuggestion) {
    if (!suggestionState) return

    const identifier = suggestion.conditions[0]?.value as string
    const categoryName = suggestionState.categoryName
    const ruleName = `${identifier} — ${categoryName}`

    const rule = {
      id: crypto.randomUUID(),
      name: ruleName,
      priority: 50,
      conditions: suggestion.conditions,
      category: suggestionState.categoryId,
      createdAt: new Date().toISOString(),
    }

    await db.rules.put(rule)

    const allIds = (await db.transactions.toArray()).map((t) => t.id)
    await applyRulesToImport(allIds)

    // Count how many got newly categorized (approximation via matchCount)
    const matchCount = suggestion.matchCount

    setSuggestionState(null)
    showToast(`Rule created — ${matchCount} transaction${matchCount !== 1 ? 's' : ''} categorized`)
  }

  function handleCustomize(suggestion: RuleSuggestion) {
    if (!suggestionState) return
    setCustomizeRule({ ...suggestionState, suggestion })
    setSuggestionState(null)
  }

  function showToast(message: string) {
    setToast(message)
    setTimeout(() => setToast(null), 3500)
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
        {totalCount !== undefined && totalCount > 0 && hasFilters && filteredTotal === 0 ? (
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
            onCategoryChanged={handleCategoryChanged}
            pageOffset={pageOffset}
            onLoadedChange={(_loaded, total, _more) => {
              setFilteredTotal(total)
            }}
            totalFiltered={filteredTotal}
            onLoadMore={() => setPageOffset((o) => o + 100)}
          />
        )}
      </div>

      {/* Bottom bar: suggestion bar takes priority over bulk bar */}
      {suggestionState ? (
        <RuleSuggestionBar
          key={suggestionState.txnId}
          suggestions={suggestionState.suggestions}
          categoryName={suggestionState.categoryName}
          onCreateRule={handleCreateRule}
          onCustomize={handleCustomize}
          onDismiss={handleDismiss}
        />
      ) : selectedIds.size > 0 ? (
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
      ) : null}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm font-medium text-white shadow-lg z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {toast}
        </div>
      )}

      {/* Customize modal */}
      {customizeRule && (
        <RuleEditorModal
          rule={{
            id: '',
            name: `${(customizeRule.suggestion.conditions[0]?.value as string) ?? ''} — ${customizeRule.categoryName}`,
            priority: 50,
            conditions: customizeRule.suggestion.conditions,
            category: customizeRule.categoryId,
            createdAt: '',
          }}
          onClose={() => setCustomizeRule(null)}
          onSaved={(count) => showToast(`Rule created — ${count} transaction${count !== 1 ? 's' : ''} categorized`)}
        />
      )}
    </div>
  )
}
