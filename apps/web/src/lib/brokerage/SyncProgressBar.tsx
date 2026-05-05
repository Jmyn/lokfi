import type { SyncCategory } from '@lokfi/brokerage-core'
import { CheckCircle, Loader2, XCircle } from 'lucide-react'
import type { SyncProgress } from './sync-orchestrator'

const CATEGORY_LABELS: Record<SyncCategory, string> = {
  positions: 'Positions',
  transactions: 'Transactions',
  fund_details: 'Fund Details',
  account: 'Account',
}

const DEFAULT_ORDER: SyncCategory[] = ['positions', 'transactions', 'fund_details', 'account']

type CategoryStatus = 'pending' | 'active' | 'success' | 'error'

interface SyncProgressBarProps {
  /** Progress events emitted so far */
  progress: SyncProgress[]
  /** Whether a sync is currently in progress */
  syncing: boolean
}

export function SyncProgressBar({ progress, syncing }: SyncProgressBarProps) {
  if (progress.length === 0 && !syncing) return null

  // Separate "complete" events (category finished) from "progress" events (in-flight)
  // Complete events have their category at a `completed` count higher than before.
  // Progress events are everything else (start-of-category, sub-category messages).

  const categoryComplete = new Map<SyncCategory, SyncProgress>()
  const activeMessages: string[] = []

  for (const event of progress) {
    if (event.error || event.completed > categoryComplete.size) {
      // This is a completion event (success or failure) — clear stale messages
      const prev = categoryComplete.get(event.category)
      if (!prev) {
        categoryComplete.set(event.category, event)
        activeMessages.length = 0 // clear sub-messages when a category finishes
      }
    } else if (event.message) {
      // Sub-category progress message — collect for display
      if (activeMessages.length === 0 || activeMessages[activeMessages.length - 1] !== event.message) {
        activeMessages.push(event.message)
      }
    } else {
      // Start-of-category event — no-op for status tracking
    }
  }

  // Determine per-category status
  const statuses = new Map<SyncCategory, { status: CategoryStatus; error?: string }>()

  for (const cat of DEFAULT_ORDER) {
    const complete = categoryComplete.get(cat)
    if (complete) {
      statuses.set(cat, {
        status: complete.error ? 'error' : 'success',
        error: complete.error,
      })
    } else {
      statuses.set(cat, { status: 'pending' })
    }
  }

  // The first pending category while syncing is "active"
  if (syncing) {
    for (const cat of DEFAULT_ORDER) {
      const s = statuses.get(cat)
      if (s?.status === 'pending') {
        statuses.set(cat, { status: 'active' })
        break
      }
    }
  }

  const completed = categoryComplete.size
  const total =
    progress.length > 0
      ? progress.reduce((max, p) => (p.total > max ? p.total : max), DEFAULT_ORDER.length)
      : DEFAULT_ORDER.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  // Latest active message
  const latestMessage = activeMessages[activeMessages.length - 1]

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
    >
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${pct}%`,
              backgroundColor: 'var(--accent)',
            }}
          />
        </div>
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400 tabular-nums min-w-[3rem] text-right">
          {completed}/{total}
        </span>
      </div>

      {/* Category indicators */}
      <div className="flex items-center gap-3">
        {DEFAULT_ORDER.map((cat) => {
          const s = statuses.get(cat)
          return (
            <div key={cat} className="flex items-center gap-1.5" title={s?.error}>
              <StatusIcon status={s?.status ?? 'pending'} />
              <span
                className="text-xs font-medium"
                style={{
                  color:
                    s?.status === 'active'
                      ? 'var(--accent)'
                      : s?.status === 'error'
                        ? '#ef4444'
                        : s?.status === 'success'
                          ? '#10b981'
                          : 'inherit',
                }}
              >
                {CATEGORY_LABELS[cat]}
              </span>
            </div>
          )
        })}
      </div>

      {/* In-progress message — only show while actively syncing */}
      {latestMessage && syncing && (
        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono animate-pulse">{latestMessage}</div>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: CategoryStatus }) {
  switch (status) {
    case 'active':
      return <Loader2 size={12} className="text-amber-500 animate-spin" />
    case 'success':
      return <CheckCircle size={12} className="text-emerald-500" />
    case 'error':
      return <XCircle size={12} className="text-red-500" />
    case 'pending':
      return <div className="w-3 h-3 rounded-full border" style={{ borderColor: 'var(--border)' }} />
  }
}
