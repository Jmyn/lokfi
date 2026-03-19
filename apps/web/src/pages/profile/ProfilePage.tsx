import { useLiveQuery } from 'dexie-react-hooks'
import { Download, AlertTriangle, Trash2, Upload } from 'lucide-react'
import { db } from '../../lib/db/db'
import type { DbCustomParserProfile } from '../../lib/db/db'
import { StorageManager } from '../../lib/db/StorageManager'
import { useBackupWarning } from '../../hooks/useBackupWarning'

export function ProfilePage() {
  const showWarning = useBackupWarning()
  const count = useLiveQuery(() => db.transactions.count(), [])
  const oldest = useLiveQuery(() => db.transactions.orderBy('date').first(), [])
  const newest = useLiveQuery(() => db.transactions.orderBy('date').last(), [])
  const rulesCount = useLiveQuery(() => db.rules.count(), [])
  const categoriesCount = useLiveQuery(() => db.categories.count(), [])
  const customParsers = useLiveQuery(() => db.customParsers.orderBy('createdAt').toArray(), []) ?? []

  async function handleExport() {
    const [transactions, rules, categories, customParsers, budgets] = await Promise.all([
      db.transactions.toArray(),
      db.rules.toArray(),
      db.categories.toArray(),
      db.customParsers.toArray(),
      db.budgets.toArray(),
    ])
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      transactions,
      rules,
      categories,
      customParsers,
      budgets,
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

  async function handleDeleteProfile(id: string) {
    await db.customParsers.delete(id)
  }

  function handleExportProfile(profile: DbCustomParserProfile) {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lokfi-parser-${profile.name.replace(/\s+/g, '-').toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportProfile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    try {
      const profile = JSON.parse(text) as DbCustomParserProfile
      // Minimal structural validation
      if (
        typeof profile.headerFingerprint !== 'string' ||
        !profile.headerFingerprint ||
        typeof profile.columnMap !== 'object' ||
        profile.columnMap === null ||
        (profile.columnMap.amount === undefined &&
          profile.columnMap.debit === undefined &&
          profile.columnMap.credit === undefined) ||
        profile.columnMap.date === undefined
      ) {
        alert('Invalid profile: missing required fields (headerFingerprint, columnMap.date, amount/debit/credit)')
        e.target.value = ''
        return
      }
      if (!profile.id) profile.id = crypto.randomUUID()
      await db.customParsers.put(profile)
    } catch {
      alert('Invalid profile file — could not parse JSON')
    }
    e.target.value = ''
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

      {/* Parser Profiles card */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Parser Profiles</h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          {customParsers.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              No saved profiles yet. Configure a CSV import and save it as a profile to see it here.
            </p>
          ) : (
            <ul className="space-y-2">
              {customParsers.map(p => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400 font-mono truncate max-w-[260px]">{p.headerFingerprint}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <button
                      onClick={() => handleExportProfile(p)}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
                    >
                      Export
                    </button>
                    <button
                      onClick={() => handleDeleteProfile(p.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                      aria-label="Delete profile"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="pt-1">
            <label
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg cursor-pointer hover:opacity-80 transition-opacity w-fit"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)', backgroundColor: 'var(--accent-subtle)' }}
            >
              <Upload className="w-4 h-4" />
              Import profile (JSON)
              <input type="file" accept=".json" className="hidden" onChange={handleImportProfile} />
            </label>
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
