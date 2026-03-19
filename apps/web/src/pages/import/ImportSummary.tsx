import { AlertTriangle } from 'lucide-react'
import type { FileParseResult } from './FileStatusList'

interface DupStats {
  newCount: number
  existingCount: number
}

interface ImportSummaryProps {
  results: FileParseResult[]
  dupStats: DupStats | null
  onImport: () => void
  onClear: () => void
}

export function ImportSummary({ results, dupStats, onImport, onClear }: ImportSummaryProps) {
  const processed = results.filter((r) => r.status !== 'pending')
  if (processed.length === 0) return null

  const successful = results.filter((r) => r.status === 'success')
  const errors = results.filter((r) => r.status === 'error')
  const totalTransactions = successful.reduce((sum, r) => sum + (r.transactionCount ?? 0), 0)
  const hasGenericFallback = successful.some((r) => r.statement?.source === 'generic')
  
  return (
    <div className="flex flex-col gap-3">
      {hasGenericFallback && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/50 dark:bg-yellow-900/20">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                Generic Fallback Parser Used
              </h3>
              <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-400">
                Some files could not be uniquely identified and were parsed using a generic fallback method. Please verify the imported amounts and dates carefully.
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-4 text-sm text-gray-700 dark:text-gray-300">
          <span>
            <span className="font-semibold">{processed.length}</span>
            <span className="text-gray-500"> / {results.length} files parsed</span>
          </span>
          <span>
            <span className="font-semibold">{totalTransactions}</span>
            <span className="text-gray-500"> transactions</span>
          </span>
          {dupStats && (
            <span>
              <span className="font-semibold text-green-600 dark:text-green-400">{dupStats.newCount} new</span>
              {dupStats.existingCount > 0 && (
                <span className="text-gray-400"> · {dupStats.existingCount} already imported</span>
              )}
            </span>
          )}
          {errors.length > 0 && (
            <span className="text-red-600 dark:text-red-400">
              <span className="font-semibold">{errors.length}</span> error{errors.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClear}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Clear
          </button>
          <button
            onClick={onImport}
            disabled={successful.length === 0}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Import All
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}
