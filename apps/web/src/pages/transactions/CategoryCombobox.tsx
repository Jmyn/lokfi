import { useState, useRef, useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/db'

const CUSTOM_COLORS = [
  '#f43f5e', '#f97316', '#eab308', '#84cc16',
  '#06b6d4', '#6366f1', '#a855f7', '#ec4899',
]

interface CategoryComboboxProps {
  value: string
  onChange: (id: string) => void
  onClose?: () => void
  placeholder?: string
  allowClear?: boolean
  autoOpen?: boolean
}

type ComboboxOption = 
  | { type: 'clear'; id: string }
  | { type: 'category'; id: string; category: { id: string, name: string, color: string } }
  | { type: 'create'; name: string }

export function CategoryCombobox({
  value,
  onChange,
  onClose,
  placeholder = 'Pick a category…',
  allowClear = false,
  autoOpen = false,
}: CategoryComboboxProps) {
  const [open, setOpen] = useState(autoOpen)
  const [inputText, setInputText] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const creatingRef = useRef(false)

  const selectedCategory = categories.find((c) => c.id === value) ?? null

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(inputText.toLowerCase())
  )

  const showCreate =
    inputText.trim().length > 0 &&
    !categories.some((c) => c.name.toLowerCase() === inputText.trim().toLowerCase())

  const options = useMemo(() => {
    const opts: ComboboxOption[] = []
    if (allowClear) {
      opts.push({ type: 'clear', id: '' })
    }
    filtered.forEach(c => opts.push({ type: 'category', id: c.id, category: c }))
    if (showCreate) {
      opts.push({ type: 'create', name: inputText.trim() })
    }
    return opts
  }, [allowClear, filtered, showCreate, inputText])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        onClose?.()
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleMouseDown)
      return () => document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      const activeEl = containerRef.current?.querySelector('[data-highlighted="true"]')
      activeEl?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex, open])

  async function handleCreateCategory() {
    const name = inputText.trim()
    if (!name || creatingRef.current) return
    creatingRef.current = true
    try {
      const count = await db.categories.count()
      const color = CUSTOM_COLORS[count % CUSTOM_COLORS.length]
      const id = 'cat_' + crypto.randomUUID()
      await db.categories.put({ id, name, color, icon: undefined, isIncome: false })
      onChange(id)
      setOpen(false)
      onClose?.()
    } finally {
      creatingRef.current = false
    }
  }

  function handleSelect(id: string) {
    onChange(id)
    setOpen(false)
    onClose?.()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => (i + 1) % Math.max(1, options.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => (i - 1 + options.length) % Math.max(1, options.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const option = options[highlightedIndex]
      if (!option) return
      if (option.type === 'clear') handleSelect('')
      else if (option.type === 'category') handleSelect(option.id)
      else if (option.type === 'create') handleCreateCategory()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      onClose?.()
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => {
            if (!o) {
              setInputText('')
              setHighlightedIndex(0)
            }
            return !o
          })
        }}
        className="flex items-center gap-1.5 text-sm border rounded-full px-3 py-1.5 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none min-w-[10rem] max-w-[16rem]"
        style={{ borderColor: 'var(--border)' }}
      >
        {selectedCategory ? (
          <>
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: selectedCategory.color }}
            />
            <span className="truncate">{selectedCategory.name}</span>
          </>
        ) : (
          <span className="text-gray-400 dark:text-gray-500 truncate">{placeholder}</span>
        )}
        <svg
          className="ml-auto w-3.5 h-3.5 text-gray-400 shrink-0"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-56 rounded-lg border shadow-lg py-1 bg-white dark:bg-gray-900"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="px-2 pb-1">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value)
                setHighlightedIndex(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search or create…"
              className="w-full rounded-md border px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1"
              style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
            />
          </div>

          <div className="max-h-52 overflow-y-auto">
            {options.map((opt, index) => {
              const isHighlighted = index === highlightedIndex
              const baseClass = "w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors text-left "
              const highlightClass = isHighlighted 
                ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100" 
                : "text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"

              if (opt.type === 'clear') {
                return (
                  <button
                    key="clear"
                    type="button"
                    onClick={() => handleSelect('')}
                    data-highlighted={isHighlighted}
                    className={baseClass + (isHighlighted ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800")}
                  >
                    Uncategorised
                  </button>
                )
              }

              if (opt.type === 'category' && opt.category) {
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelect(opt.id)}
                    data-highlighted={isHighlighted}
                    className={baseClass + highlightClass}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: opt.category.color }} />
                    <span className="truncate">{opt.category.name}</span>
                  </button>
                )
              }

              if (opt.type === 'create') {
                return (
                  <button
                    key="create"
                    type="button"
                    onClick={handleCreateCategory}
                    data-highlighted={isHighlighted}
                    className={baseClass + "font-medium " + (isHighlighted ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100" : "hover:bg-gray-50 dark:hover:bg-gray-800")}
                    style={{ color: 'var(--accent)' }}
                  >
                    + Create &ldquo;{opt.name}&rdquo;
                  </button>
                )
              }
              return null
            })}

            {options.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">No categories found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
