import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, X } from 'lucide-react'
import type { Statement } from '@lokfi/parser-core'

export type FileParseStatus = 'pending' | 'parsing' | 'success' | 'error'

export interface FileParseResult {
  file: File
  status: FileParseStatus
  transactionCount?: number
  statement?: Statement
  error?: string
  rawText?: string
  profileName?: string
}

interface FileStatusListProps {
  items: FileParseResult[]
  onConfigure: (item: FileParseResult) => void
  onRemove: (item: FileParseResult) => void
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatAmount(value: number) {
  const abs = Math.abs(value).toFixed(2)
  return value < 0 ? `-${abs}` : `+${abs}`
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
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

export function FileStatusList({ items, onConfigure, onRemove }: FileStatusListProps) {
  if (items.length === 0) return null

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => {
        const sample = item.statement?.transactions[0]
        return (
          <li
            key={i}
            className="flex flex-col rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm overflow-hidden"
          >
            {/* Main row: filename + status + remove */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="font-medium text-gray-800 dark:text-gray-100 truncate">
                  {item.file.name}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatBytes(item.file.size)}
                </span>
              </div>
              <div className="ml-4 flex items-start gap-2 shrink-0">
              <div className="flex flex-col items-end gap-0.5">
                <StatusBadge status={item.status} />
                {item.status === 'success' && item.transactionCount !== undefined && (
                  <span className="text-xs text-green-600 dark:text-green-400">
                    {item.transactionCount} transactions found
                  </span>
                )}
                {item.status === 'success' && item.profileName && (
                  <span className="text-xs text-blue-600 dark:text-blue-400">
                    Profile: {item.profileName}
                  </span>
                )}
                {item.status === 'success' && item.statement?.source === 'generic' && !item.profileName && (
                  <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-500 max-w-[200px] text-right">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Generic fallback — verify data
                  </span>
                )}
                {item.status === 'success' && item.rawText && (
                  item.statement?.source === 'generic' && !item.profileName ? (
                    <button
                      onClick={() => onConfigure(item)}
                      className="text-xs font-medium px-2 py-1 rounded border border-yellow-400 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                    >
                      Configure mapping
                    </button>
                  ) : (
                    <button
                      onClick={() => onConfigure(item)}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
                    >
                      Wrong mapping? Configure
                    </button>
                  )
                )}
                {item.status === 'error' && item.error && (
                  <span className="text-xs text-red-500 dark:text-red-400 max-w-[200px] text-right">
                    {item.error}
                  </span>
                )}
                {item.status === 'error' && item.rawText && (
                  <button
                    onClick={() => onConfigure(item)}
                    className="text-xs font-medium px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Configure parser
                  </button>
                )}
              </div>
              <button
                onClick={() => onRemove(item)}
                className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors mt-0.5"
                aria-label="Remove file"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              </div>
            </div>

            {/* Sample row: first parsed transaction + statement metadata */}
            {item.status === 'success' && sample && item.statement && (
              <div className="flex flex-col border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                {/* Statement metadata: source + account */}
                <div className="flex items-center gap-3 px-4 pt-2 pb-1">
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">Source</span>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                    {item.statement.source}
                  </span>
                  <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">Account</span>
                  <span className="text-xs font-mono text-gray-600 dark:text-gray-300 truncate">
                    {item.statement.accountNo}
                  </span>
                </div>
                {/* First transaction sample */}
                <div className="flex items-center justify-between px-4 pb-2">
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 mr-3">
                    Sample
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                    {formatDate(sample.date)}
                  </span>
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate mx-3 flex-1">
                    {sample.description}
                  </span>
                  <span className={`text-xs font-mono shrink-0 ${sample.transactionValue < 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {formatAmount(sample.transactionValue)}
                  </span>
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
