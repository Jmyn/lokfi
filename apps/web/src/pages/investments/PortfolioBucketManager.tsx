import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowUp, Trash2, X } from 'lucide-react'
import { db } from '../../lib/db/db'

interface PortfolioBucketManagerProps {
  open: boolean
  onClose: () => void
}

const COLOR_SWATCHES = ['#3b82f6', '#22c55e', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#64748b', '#ef4444']

export function PortfolioBucketManager({ open, onClose }: PortfolioBucketManagerProps) {
  const buckets = useLiveQuery(() => db.portfolioBuckets.orderBy('sortOrder').toArray(), []) ?? []

  if (!open) return null

  async function renameBucket(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    await db.portfolioBuckets.update(id, { name: trimmed, updatedAt: new Date().toISOString() })
  }

  async function recolorBucket(id: string, color: string) {
    await db.portfolioBuckets.update(id, { color, updatedAt: new Date().toISOString() })
  }

  async function moveBucket(id: string, direction: -1 | 1) {
    const index = buckets.findIndex((bucket) => bucket.id === id)
    const swap = buckets[index + direction]
    const current = buckets[index]
    if (!current || !swap) return
    await db.transaction('rw', [db.portfolioBuckets], async () => {
      await db.portfolioBuckets.update(current.id, {
        sortOrder: swap.sortOrder,
        updatedAt: new Date().toISOString(),
      })
      await db.portfolioBuckets.update(swap.id, {
        sortOrder: current.sortOrder,
        updatedAt: new Date().toISOString(),
      })
    })
  }

  async function deleteBucket(id: string) {
    const confirmed = window.confirm('Delete this portfolio bucket? Affected holdings will become Unassigned.')
    if (!confirmed) return
    await db.transaction('rw', [db.portfolioBuckets, db.portfolioBucketAssignments], async () => {
      await db.portfolioBuckets.delete(id)
      await db.portfolioBucketAssignments.where('bucketId').equals(id).delete()
    })
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-lg rounded-xl border bg-white shadow-xl dark:bg-gray-950"
        style={{ borderColor: 'var(--border)' }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="font-serif text-lg text-gray-900 dark:text-white">Portfolio buckets</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto p-5">
          {buckets.map((bucket, index) => (
            <div
              key={bucket.id}
              className="rounded-lg border p-3"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-2">
                <input
                  defaultValue={bucket.name}
                  onBlur={(event) => renameBucket(bucket.id, event.target.value)}
                  className="min-w-0 flex-1 rounded-md border bg-white px-2 py-1.5 text-sm text-gray-900 dark:bg-gray-900 dark:text-white"
                  style={{ borderColor: 'var(--border)' }}
                />
                <button
                  type="button"
                  onClick={() => moveBucket(bucket.id, -1)}
                  disabled={index === 0}
                  className="rounded border p-1 disabled:opacity-30"
                  style={{ borderColor: 'var(--border)' }}
                  aria-label="Move up"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => moveBucket(bucket.id, 1)}
                  disabled={index === buckets.length - 1}
                  className="rounded border p-1 disabled:opacity-30"
                  style={{ borderColor: 'var(--border)' }}
                  aria-label="Move down"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => deleteBucket(bucket.id)}
                  className="rounded border p-1 text-red-500"
                  style={{ borderColor: 'var(--border)' }}
                  aria-label="Delete bucket"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {COLOR_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => recolorBucket(bucket.id, color)}
                    className={`h-6 w-6 rounded-full border-2 ${
                      bucket.color === color ? 'border-gray-900 dark:border-white' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Use ${color}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
