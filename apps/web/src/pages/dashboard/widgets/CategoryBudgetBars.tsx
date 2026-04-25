import { useMemo, useState } from 'react'
import { db } from '../../../lib/db/db'
import { fmt } from '../../../lib/format'
import { useDashboard } from '../DashboardContext'

export function CategoryBudgetBars() {
  const { transactions, categories, budgets } = useDashboard()
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of transactions) {
      if (t.transactionValue >= 0) continue
      const catId = t.manualCategory ?? t.category
      if (!catId) continue
      map.set(catId, (map.get(catId) ?? 0) + Math.abs(t.transactionValue))
    }
    return map
  }, [transactions])

  const budgetMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of budgets) {
      map.set(b.categoryId, b.monthlyLimit)
    }
    return map
  }, [budgets])

  // Show categories that have a budget OR have spending
  const visibleCategories = useMemo(() => {
    return categories
      .filter((c) => !c.isIncome && (budgetMap.has(c.id) || spentByCategory.has(c.id)))
      .sort((a, b) => (spentByCategory.get(b.id) ?? 0) - (spentByCategory.get(a.id) ?? 0))
  }, [categories, budgetMap, spentByCategory])

  async function saveBudget(categoryId: string) {
    const amount = Number.parseFloat(editValue)
    if (isNaN(amount) || amount <= 0) {
      setEditingCatId(null)
      return
    }
    const existing = budgets.find((b) => b.categoryId === categoryId)
    await db.budgets.put({
      id: existing?.id ?? crypto.randomUUID(),
      categoryId,
      monthlyLimit: amount,
      updatedAt: new Date().toISOString(),
    })
    setEditingCatId(null)
  }

  async function removeBudget(categoryId: string) {
    const existing = budgets.find((b) => b.categoryId === categoryId)
    if (existing) {
      await db.budgets.delete(existing.id)
    }
    setEditingCatId(null)
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        Category Budgets
      </h2>
      {visibleCategories.length === 0 ? (
        <div
          className="rounded-xl border px-5 py-10 text-center"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
        >
          <p className="text-sm text-gray-400">No spending categories yet.</p>
        </div>
      ) : (
        <div
          className="rounded-xl border p-5 space-y-4"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
        >
          {visibleCategories.map((cat) => {
            const spent = spentByCategory.get(cat.id) ?? 0
            const budget = budgetMap.get(cat.id)
            const pct = budget ? Math.min((spent / budget) * 100, 100) : 0
            const overBudget = budget ? spent > budget : false
            const isEditing = editingCatId === cat.id

            return (
              <div key={cat.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: cat.color }} />
                    <span className="font-medium text-gray-900 dark:text-white">{cat.name}</span>
                  </span>
                  <span className="font-mono text-xs text-gray-500">
                    {fmt.format(spent)}
                    {budget ? ` / ${fmt.format(budget)}` : ''}
                  </span>
                </div>

                {budget ? (
                  <div
                    className="relative h-2 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'var(--border)' }}
                  >
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: overBudget ? '#ef4444' : cat.color,
                      }}
                    />
                  </div>
                ) : null}

                {overBudget && (
                  <div className="text-xs text-red-500 font-medium">Over budget by {fmt.format(spent - budget!)}</div>
                )}

                {/* Edit / Set budget */}
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Monthly limit"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveBudget(cat.id)
                        if (e.key === 'Escape') setEditingCatId(null)
                      }}
                      autoFocus
                      className="text-xs border rounded-lg px-2.5 py-1.5 w-28 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2"
                      style={{ borderColor: 'var(--border)' }}
                    />
                    <button
                      onClick={() => saveBudget(cat.id)}
                      className="text-xs font-medium px-2 py-1 rounded transition-colors"
                      style={{ color: 'var(--accent)' }}
                    >
                      Save
                    </button>
                    {budget && (
                      <button
                        onClick={() => removeBudget(cat.id)}
                        className="text-xs font-medium px-2 py-1 rounded text-red-500 transition-colors hover:underline"
                      >
                        Remove
                      </button>
                    )}
                    <button onClick={() => setEditingCatId(null)} className="text-xs text-gray-400 px-2 py-1">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingCatId(cat.id)
                      setEditValue(budget?.toString() ?? '')
                    }}
                    className="text-xs font-medium transition-colors hover:underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    {budget ? 'Edit budget' : 'Set budget'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
