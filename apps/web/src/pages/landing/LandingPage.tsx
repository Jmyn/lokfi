import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/db'

export function LandingPage() {
  const navigate = useNavigate()
  const count = useLiveQuery(() => db.transactions.count(), [])

  useEffect(() => {
    if (count !== undefined && count > 0) {
      navigate({ to: '/transactions' })
    }
  }, [count, navigate])

  // Loading
  if (count === undefined) return null

  // Has data — redirect handled by effect
  if (count > 0) return null

  return (
    <div className="flex min-h-screen items-center justify-center bg-white dark:bg-gray-950 px-4">
      <div className="text-center max-w-md">
        <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-3">Lokfi</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
          Your finances, privately tracked.
        </p>
        <button
          onClick={() => navigate({ to: '/import' })}
          className="inline-flex items-center px-6 py-3 bg-blue-600 text-white text-base font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Import your first statement
        </button>
        <p className="mt-6 text-sm text-gray-400 dark:text-gray-500">
          All data stays on your device — no accounts, no cloud.
        </p>
      </div>
    </div>
  )
}
