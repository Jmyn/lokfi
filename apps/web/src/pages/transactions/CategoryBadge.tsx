import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/db'

interface CategoryBadgeProps {
  transactionId: string
  category?: string
  manualCategory?: string
}

export function CategoryBadge({ transactionId, category, manualCategory }: CategoryBadgeProps) {
  const [editing, setEditing] = useState(false)
  const categories = useLiveQuery(() => db.categories.toArray(), [])

  const resolvedId = manualCategory ?? category ?? null

  const resolvedCategory = categories?.find((c) => c.id === resolvedId) ?? null

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value || undefined
    await db.transactions.update(transactionId, { manualCategory: value })
    setEditing(false)
  }

  if (editing) {
    return (
      <select
        autoFocus
        defaultValue={resolvedId ?? ''}
        onChange={handleChange}
        onBlur={() => setEditing(false)}
        className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
      >
        <option value="">Uncategorised</option>
        {categories?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1.5 text-xs rounded px-1.5 py-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
    >
      {resolvedCategory ? (
        <>
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: resolvedCategory.color }}
          />
          <span className="text-gray-700 dark:text-gray-300">{resolvedCategory.name}</span>
        </>
      ) : (
        <span className="text-gray-400 dark:text-gray-500">Uncategorised</span>
      )}
    </button>
  )
}
