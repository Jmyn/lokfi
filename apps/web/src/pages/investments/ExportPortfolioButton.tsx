import { Download } from 'lucide-react'
import { useState } from 'react'
import { db } from '../../lib/db/db'
import { createPortfolioExport } from '../../lib/investments/exportPortfolio'

export function ExportPortfolioButton({ syncing }: { syncing: boolean }) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    setError(null)
    try {
      const { filename, text } = await createPortfolioExport(db)
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      try {
        link.click()
      } finally {
        link.remove()
        // Allow the browser to begin consuming the download before releasing it.
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch {
      setError('Could not export your portfolio. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={handleExport}
          disabled={syncing || exporting}
          aria-describedby="portfolio-export-description"
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ borderColor: 'var(--border)' }}
        >
          <Download size={14} />
          {exporting ? 'Exporting...' : 'Export portfolio'}
        </button>
        <p id="portfolio-export-description" className="text-xs text-gray-500 dark:text-gray-400">
          {syncing
            ? 'Export is available when syncing finishes.'
            : 'Download all investment holdings, cash, and targets as a text file for analysis or sharing. Nothing is uploaded.'}
        </p>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
