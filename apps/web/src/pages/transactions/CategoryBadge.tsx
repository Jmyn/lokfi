import { useLiveQuery } from 'dexie-react-hooks'
import { Bot, Pen } from 'lucide-react'
import { useState } from 'react'
import { db } from '../../lib/db/db'
import type { DbTransaction } from '../../lib/db/db'
import { CategoryCombobox } from './CategoryCombobox'

interface CategoryBadgeProps {
  transactionId: string
  category?: string
  manualCategory?: string
  isEditing?: boolean
  onStartEdit?: () => void
  onStopEdit?: () => void
  onCategoryChanged?: (txn: DbTransaction, categoryId: string | undefined) => void
}

export function CategoryBadge({
  transactionId,
  category,
  manualCategory,
  isEditing,
  onStartEdit,
  onStopEdit,
  onCategoryChanged,
}: CategoryBadgeProps) {
  const [localEditing, setLocalEditing] = useState(false)
  const categories = useLiveQuery(() => db.categories.toArray(), [])

  const editing = isEditing !== undefined ? isEditing : localEditing
  const startEdit = onStartEdit || (() => setLocalEditing(true))
  const stopEdit = onStopEdit || (() => setLocalEditing(false))

  const resolvedId = manualCategory ?? category ?? null
  const resolvedCategory = categories?.find((c) => c.id === resolvedId) ?? null
  const isManual = !!manualCategory
  const isRule = !manualCategory && !!category

  async function handleChange(id: string) {
    const categoryId = id || undefined
    await db.transactions.update(transactionId, { manualCategory: categoryId })
    stopEdit()
    if (onCategoryChanged) {
      const txn = await db.transactions.get(transactionId)
      if (txn) onCategoryChanged(txn, categoryId)
    }
  }

  if (editing) {
    return (
      <CategoryCombobox
        value={resolvedId ?? ''}
        onChange={handleChange}
        onClose={stopEdit}
        autoOpen={true}
        allowClear={true}
        placeholder="Uncategorised"
      />
    )
  }

  return (
    <button
      onClick={startEdit}
      className="flex items-center gap-1.5 text-xs rounded-full px-2 py-0.5 transition-colors"
      title={
        isRule
          ? 'Assigned by rule — click to override'
          : isManual
            ? 'Manually assigned — click to unassign and refresh to evaluate by rules'
            : undefined
      }
      style={
        resolvedCategory
          ? {
              backgroundColor: 'color-mix(in srgb, ' + resolvedCategory.color + ' 15%, transparent)',
            }
          : { backgroundColor: 'transparent' }
      }
    >
      {resolvedCategory ? (
        <>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: resolvedCategory.color }} />
          <span className="text-gray-700 dark:text-gray-300 font-medium">{resolvedCategory.name}</span>
          {isRule && <Bot className="w-3 h-3 shrink-0 text-gray-400 dark:text-gray-500" />}
          {isManual && <Pen className="w-3 h-3 shrink-0 text-gray-400 dark:text-gray-500" />}
        </>
      ) : (
        <span className="font-medium tracking-tight" style={{ color: 'var(--accent)' }}>
          + Categorise
        </span>
      )}
    </button>
  )
}
