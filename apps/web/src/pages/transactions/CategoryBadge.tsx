import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/db'
import { CategoryCombobox } from './CategoryCombobox'

interface CategoryBadgeProps {
  transactionId: string
  category?: string
  manualCategory?: string
  isEditing?: boolean
  onStartEdit?: () => void
  onStopEdit?: () => void
}

export function CategoryBadge({ 
  transactionId, 
  category, 
  manualCategory,
  isEditing,
  onStartEdit,
  onStopEdit
}: CategoryBadgeProps) {
  const [localEditing, setLocalEditing] = useState(false)
  const categories = useLiveQuery(() => db.categories.toArray(), [])

  const editing = isEditing !== undefined ? isEditing : localEditing
  const startEdit = onStartEdit || (() => setLocalEditing(true))
  const stopEdit = onStopEdit || (() => setLocalEditing(false))

  const resolvedId = manualCategory ?? category ?? null
  const resolvedCategory = categories?.find((c) => c.id === resolvedId) ?? null

  async function handleChange(id: string) {
    await db.transactions.update(transactionId, { manualCategory: id || undefined })
    stopEdit()
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
      style={
        resolvedCategory
          ? { backgroundColor: 'color-mix(in srgb, ' + resolvedCategory.color + ' 15%, transparent)' }
          : { backgroundColor: 'transparent' }
      }
    >
      {resolvedCategory ? (
        <>
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: resolvedCategory.color }}
          />
          <span className="text-gray-700 dark:text-gray-300 font-medium">{resolvedCategory.name}</span>
        </>
      ) : (
        <span
          className="font-medium tracking-tight"
          style={{ color: 'var(--accent)' }}
        >
          + Categorise
        </span>
      )}
    </button>
  )
}
