import { useLiveQuery } from 'dexie-react-hooks'
import { Settings } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../../lib/db/db'
import type { DbPortfolioBucket } from '../../lib/investments/portfolioBuckets'

const CUSTOM_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#64748b', '#ef4444']

interface PortfolioBucketComboboxProps {
  value: string | null
  onChange: (id: string | null) => void
  onManage: () => void
  placeholder?: string
}

type ComboboxOption =
  | { type: 'clear'; id: 'clear' }
  | { type: 'bucket'; id: string; bucket: DbPortfolioBucket }
  | { type: 'create'; id: 'create'; name: string }
  | { type: 'manage'; id: 'manage' }

export function PortfolioBucketCombobox({
  value,
  onChange,
  onManage,
  placeholder = 'Unassigned',
}: PortfolioBucketComboboxProps) {
  const [open, setOpen] = useState(false)
  const [inputText, setInputText] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const buckets = useLiveQuery(() => db.portfolioBuckets.orderBy('sortOrder').toArray(), []) ?? []
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const creatingRef = useRef(false)

  const selectedBucket = buckets.find((bucket) => bucket.id === value) ?? null
  const filtered = buckets.filter((bucket) => bucket.name.toLowerCase().includes(inputText.toLowerCase()))
  const showCreate =
    inputText.trim().length > 0 &&
    !buckets.some((bucket) => bucket.name.toLowerCase() === inputText.trim().toLowerCase())

  const options = useMemo<ComboboxOption[]>(() => {
    const opts: ComboboxOption[] = [{ type: 'clear', id: 'clear' }]
    filtered.forEach((bucket) => opts.push({ type: 'bucket', id: bucket.id, bucket }))
    if (showCreate) opts.push({ type: 'create', id: 'create', name: inputText.trim() })
    opts.push({ type: 'manage', id: 'manage' })
    return opts
  }, [filtered, showCreate, inputText])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleMouseDown)
      return () => document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [open])

  async function handleCreateBucket() {
    const name = inputText.trim()
    if (!name || creatingRef.current) return
    creatingRef.current = true
    try {
      const now = new Date().toISOString()
      const id = 'bucket_' + crypto.randomUUID()
      const color = CUSTOM_COLORS[buckets.length % CUSTOM_COLORS.length]
      const sortOrder = buckets.length
      await db.portfolioBuckets.put({
        id,
        name,
        color,
        sortOrder,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      })
      onChange(id)
      setOpen(false)
    } finally {
      creatingRef.current = false
    }
  }

  function selectBucket(id: string | null) {
    onChange(id)
    setOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((index) => (index + 1) % Math.max(1, options.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((index) => (index - 1 + options.length) % Math.max(1, options.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = options[highlightedIndex]
      if (!option) return
      if (option.type === 'clear') selectBucket(null)
      if (option.type === 'bucket') selectBucket(option.id)
      if (option.type === 'create') handleCreateBucket()
      if (option.type === 'manage') {
        setOpen(false)
        onManage()
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setInputText('')
          setHighlightedIndex(0)
          setOpen((current) => !current)
        }}
        className="inline-flex min-w-[8rem] max-w-[12rem] items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs text-gray-900 focus:outline-none dark:bg-gray-900 dark:text-white"
        style={{ borderColor: 'var(--border)' }}
      >
        {selectedBucket ? (
          <>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: selectedBucket.color }} />
            <span className="truncate">{selectedBucket.name}</span>
          </>
        ) : (
          <span className="truncate text-gray-400 dark:text-gray-500">{placeholder}</span>
        )}
        <span className="ml-auto text-xs text-gray-400">⌄</span>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-[1000] mt-1 w-60 rounded-lg border bg-white py-1 shadow-lg dark:bg-gray-900"
          style={{ borderColor: 'var(--border)' }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="px-2 pb-1">
            <input
              ref={inputRef}
              value={inputText}
              onChange={(event) => {
                setInputText(event.target.value)
                setHighlightedIndex(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search or create bucket..."
              className="w-full rounded-md border bg-white px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-white"
              style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
            />
          </div>

          <div className="max-h-40 overflow-y-auto">
            {options.map((option, index) => {
              const highlighted = index === highlightedIndex
              const baseClass = 'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors '
              const activeClass = highlighted
                ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                : 'text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800'

              if (option.type === 'clear') {
                return (
                  <button
                    key="clear"
                    type="button"
                    data-highlighted={highlighted}
                    onClick={() => selectBucket(null)}
                    className={baseClass + activeClass}
                  >
                    Unassigned
                  </button>
                )
              }
              if (option.type === 'bucket') {
                return (
                  <button
                    key={option.id}
                    type="button"
                    data-highlighted={highlighted}
                    onClick={() => selectBucket(option.id)}
                    className={baseClass + activeClass}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: option.bucket.color }} />
                    <span className="truncate">{option.bucket.name}</span>
                  </button>
                )
              }
              if (option.type === 'create') {
                return (
                  <button
                    key="create"
                    type="button"
                    data-highlighted={highlighted}
                    onClick={handleCreateBucket}
                    className={baseClass + activeClass}
                    style={{ color: 'var(--accent)' }}
                  >
                    + Create &quot;{option.name}&quot;
                  </button>
                )
              }
              return (
                <button
                  key="manage"
                  type="button"
                  data-highlighted={highlighted}
                  onClick={() => {
                    setOpen(false)
                    onManage()
                  }}
                  className={baseClass + activeClass}
                >
                  <Settings size={14} />
                  Manage buckets...
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
