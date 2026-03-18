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
        className="text-xs border rounded-md px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2"
        style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
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
