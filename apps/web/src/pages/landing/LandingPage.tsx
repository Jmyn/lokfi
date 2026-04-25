import { useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { db } from '../../lib/db/db'

export function LandingPage() {
  const navigate = useNavigate()
  const count = useLiveQuery(() => db.transactions.count(), [])

  useEffect(() => {
    if (count !== undefined && count > 0) {
      navigate({ to: '/dashboard' })
    }
  }, [count, navigate])

  if (count === undefined) return null
  if (count > 0) return null

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="text-center max-w-md">
        {/* Brand mark */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <span
            className="flex items-center justify-center w-10 h-10 rounded-xl text-white text-base font-bold"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            ◆
          </span>
          <span className="font-serif text-2xl text-gray-900 dark:text-white tracking-tight">Lokfi</span>
        </div>

        <h1 className="font-serif text-4xl text-gray-900 dark:text-white mb-3 leading-tight">
          Your finances,
          <br />
          privately tracked.
        </h1>
        <p className="text-base text-gray-500 dark:text-gray-400 mb-8">
          Import bank statements, categorise spending, and understand your money — all on your device.
        </p>
        <button
          onClick={() => navigate({ to: '/import' })}
          className="inline-flex items-center px-6 py-3 text-white text-sm font-semibold rounded-xl transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          Import your first statement →
        </button>
        <p className="mt-6 text-xs text-gray-400 dark:text-gray-500">
          No accounts, no cloud. Everything stays on your device.
        </p>
      </div>
    </div>
  )
}
