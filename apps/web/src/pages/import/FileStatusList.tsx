import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react'
import type { Statement } from '@lokfi/parser-core'

export type FileParseStatus = 'pending' | 'parsing' | 'success' | 'error'

export interface FileParseResult {
  file: File
  status: FileParseStatus
  transactionCount?: number
  statement?: Statement
  error?: string
}

interface FileStatusListProps {
  items: FileParseResult[]
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StatusBadge({ status }: { status: FileParseStatus }) {
  if (status === 'pending') {
    return (
      <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
        <Clock className="h-3.5 w-3.5" />
        Pending
      </span>
    )
  }
  if (status === 'parsing') {
    return (
      <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Parsing…
      </span>
    )
  }
  if (status === 'success') {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Done
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
      <XCircle className="h-3.5 w-3.5" />
      Error
    </span>
  )
}

export function FileStatusList({ items }: FileStatusListProps) {
  if (items.length === 0) return null

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm"
        >
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-medium text-gray-800 dark:text-gray-100 truncate">
              {item.file.name}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatBytes(item.file.size)}
            </span>
          </div>
          <div className="ml-4 flex flex-col items-end gap-0.5 shrink-0">
            <StatusBadge status={item.status} />
            {item.status === 'success' && item.transactionCount !== undefined && (
              <span className="text-xs text-green-600 dark:text-green-400">
                {item.transactionCount} transactions found
              </span>
            )}
            {item.status === 'success' && item.statement?.source === 'generic' && (
              <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-500 max-w-[200px] text-right">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Parsed using generic fallback. Please check data for mistakes.
              </span>
            )}
            {item.status === 'error' && item.error && (
              <span className="text-xs text-red-500 dark:text-red-400 max-w-[200px] text-right">
                {item.error}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
