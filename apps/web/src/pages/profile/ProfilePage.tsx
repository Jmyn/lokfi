import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/db'
import { StorageManager } from '../../lib/db/StorageManager'
import { useBackupWarning } from '../../hooks/useBackupWarning'

export function ProfilePage() {
  const showWarning = useBackupWarning()
  const count = useLiveQuery(() => db.transactions.count(), [])
  const oldest = useLiveQuery(() => db.transactions.orderBy('date').first(), [])

  async function handleExport() {
    const [transactions, rules, categories] = await Promise.all([
      db.transactions.toArray(),
      db.rules.toArray(),
      db.categories.toArray(),
    ])
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      transactions,
      rules,
      categories,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'lokfi-backup.json'
    a.click()
    URL.revokeObjectURL(url)
    await StorageManager.recordExportEvent()
  }

  async function handleClearData() {
    const confirmed = window.confirm(
      'This will permanently delete all transactions, rules, and categories. Are you sure?'
    )
    if (!confirmed) return
    await db.delete()
    window.location.reload()
  }

  return (
    <div className="p-6 max-w-lg space-y-8">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Profile</h1>

      {/* Backup warning */}
      {showWarning && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300">
          You haven't exported in 30 days. Back up your data.
        </div>
      )}

      {/* Export */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">Export</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Downloads a JSON backup of all transactions, rules, and categories.
        </p>
        <button
          onClick={handleExport}
          className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors"
        >
          Export backup (JSON)
        </button>
      </section>

      {/* Stats */}
      <section className="space-y-1">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">Summary</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {count !== undefined ? `${count} transactions imported` : 'Loading…'}
        </p>
        {oldest && (
          <p className="text-sm text-gray-600 dark:text-gray-400">Oldest: {oldest.date}</p>
        )}
      </section>

      {/* Danger zone */}
      <section className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-800">
        <h2 className="text-sm font-medium text-red-600 dark:text-red-400">Danger zone</h2>
        <button
          onClick={handleClearData}
          className="px-4 py-2 text-sm border border-red-300 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          Clear all data
        </button>
      </section>
    </div>
  )
}
