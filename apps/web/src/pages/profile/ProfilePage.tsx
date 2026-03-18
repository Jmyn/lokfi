import { useLiveQuery } from 'dexie-react-hooks'
import { Download, AlertTriangle } from 'lucide-react'
import { db } from '../../lib/db/db'
import { StorageManager } from '../../lib/db/StorageManager'
import { useBackupWarning } from '../../hooks/useBackupWarning'

export function ProfilePage() {
  const showWarning = useBackupWarning()
  const count = useLiveQuery(() => db.transactions.count(), [])
  const oldest = useLiveQuery(() => db.transactions.orderBy('date').first(), [])
  const newest = useLiveQuery(() => db.transactions.orderBy('date').last(), [])
  const rulesCount = useLiveQuery(() => db.rules.count(), [])
  const categoriesCount = useLiveQuery(() => db.categories.count(), [])

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
    <div className="p-6 max-w-xl space-y-6">
      <h1 className="font-serif text-2xl text-gray-900 dark:text-white">Profile</h1>

      {/* Data & Backup card */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Data & Backup</h2>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Backup warning inline */}
          {showWarning && (
            <div
              className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm border"
              style={{
                borderColor: 'var(--accent)',
                backgroundColor: 'var(--accent-subtle)',
                color: 'var(--accent-text)',
              }}
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
              <span>You haven't exported in 30 days. Back up your data.</span>
            </div>
          )}

          {/* Data summary */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Transactions', value: count !== undefined ? count : '…' },
              { label: 'Rules', value: rulesCount !== undefined ? rulesCount : '…' },
              { label: 'Categories', value: categoriesCount !== undefined ? categoriesCount : '…' },
              {
                label: 'Date range',
                value:
                  oldest && newest
                    ? `${oldest.date.slice(0, 7)} → ${newest.date.slice(0, 7)}`
                    : '—',
              },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-lg border px-4 py-3"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
              >
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
                <p className="font-mono text-base font-medium text-gray-900 dark:text-white">
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Export button */}
          <div className="pt-1">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Downloads a JSON backup of all transactions, rules, and categories.
            </p>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg transition-colors hover:opacity-90"
              style={{
                borderColor: 'var(--accent)',
                color: 'var(--accent)',
                backgroundColor: 'var(--accent-subtle)',
              }}
            >
              <Download className="w-4 h-4" />
              Export backup (JSON)
            </button>
          </div>
        </div>
      </div>

      {/* Danger zone card */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: '#fca5a5', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <div
          className="px-5 py-4 border-b"
          style={{ borderColor: '#fca5a5' }}
        >
          <h2 className="text-sm font-semibold text-red-600 dark:text-red-400">Danger Zone</h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Permanently deletes all transactions, rules, and categories. This cannot be undone.
          </p>
          <button
            onClick={handleClearData}
            className="px-4 py-2 text-sm font-medium border rounded-lg transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
            style={{ borderColor: '#ef4444', color: '#ef4444' }}
          >
            Clear all data
          </button>
        </div>
      </div>
    </div>
  )
}
