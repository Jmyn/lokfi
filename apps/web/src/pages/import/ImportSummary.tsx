import type { FileParseResult } from './FileStatusList'

interface ImportSummaryProps {
  results: FileParseResult[]
  onImport: () => void
  onClear: () => void
}

export function ImportSummary({ results, onImport, onClear }: ImportSummaryProps) {
  const processed = results.filter((r) => r.status !== 'pending')
  if (processed.length === 0) return null

  const successful = results.filter((r) => r.status === 'success')
  const errors = results.filter((r) => r.status === 'error')
  const totalTransactions = successful.reduce((sum, r) => sum + (r.transactionCount ?? 0), 0)

  return (
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
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Import All
          </button>
        </div>
      </div>
    </div>
  )
}
