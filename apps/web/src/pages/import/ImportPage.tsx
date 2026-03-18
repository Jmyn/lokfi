import { useState, useEffect } from 'react'
import { ParserRegistry, CdcDebitParser, GenericCsvParser, ParseError, generateTransactionHash } from '@lokfi/parser-core'
import { db } from '../../lib/db/db'
import type { DbTransaction } from '../../lib/db/db'
import { StorageManager } from '../../lib/db/StorageManager'
import { applyRulesToImport } from '../../lib/rules/applyRulesToImport'
import { UploadZone } from './UploadZone'
import { FileStatusList, type FileParseResult } from './FileStatusList'
import { ImportSummary } from './ImportSummary'

const registry = new ParserRegistry()
registry.register(new CdcDebitParser())
registry.registerFallback(new GenericCsvParser())

export function ImportPage() {
  const [items, setItems] = useState<FileParseResult[]>([])
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    StorageManager.initPersistence()
  }, [])

  function updateItem(file: File, patch: Partial<FileParseResult>) {
    setItems((prev) =>
      prev.map((item) => (item.file === file ? { ...item, ...patch } : item)),
    )
  }

  function handleFilesAdded(files: File[]) {
    const newItems: FileParseResult[] = files.map((file) => ({ file, status: 'pending' }))
    setItems((prev) => [...prev, ...newItems])

    files.forEach((file) => {
      updateItem(file, { status: 'parsing' })

      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        try {
          const parser = registry.getParser(text)
          if (!parser) throw new ParseError('No parser found for this file')
          const statement = parser.parse(text)
          updateItem(file, {
            status: 'success',
            transactionCount: statement.transactions.length,
            statement,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          updateItem(file, { status: 'error', error: message })
        }
      }
      reader.onerror = () => updateItem(file, { status: 'error', error: 'Failed to read file' })
      reader.readAsText(file)
    })
  }

  async function handleImport() {
    setImportError(null)
    const successItems = items.filter((item) => item.status === 'success' && item.statement)
    if (successItems.length === 0) return

    const records: DbTransaction[] = []
    const importedAt = new Date().toISOString()

    for (const item of successItems) {
      const stmt = item.statement!
      const occurrenceCounts = new Map<string, number>()
      for (const txn of stmt.transactions) {
        const key = `${txn.date}|${txn.description}|${txn.transactionValue}`
        const idx = occurrenceCounts.get(key) ?? 0
        occurrenceCounts.set(key, idx + 1)
        const hash = generateTransactionHash(txn, idx)
        records.push({
          id: hash,
          hash,
          source: stmt.source,
          accountNo: stmt.accountNo,
          date: txn.date,
          description: txn.description,
          transactionValue: txn.transactionValue,
          balance: txn.balance,
          importedAt,
        })
      }
    }

    try {
      await db.transactions.bulkPut(records)
      await applyRulesToImport(records.map((r) => r.id))
      handleClear()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save transactions'
      setImportError(message)
    }
  }

  function handleClear() {
    setItems([])
    setImportError(null)
  }

  return (
    <div className="min-h-screen px-6 py-10" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="mx-auto max-w-2xl flex flex-col gap-6">
        <div>
          <h1 className="font-serif text-2xl text-gray-900 dark:text-white">Import Statements</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Upload CSV or PDF bank statements to import transactions.
          </p>
        </div>
        <UploadZone onFilesAdded={handleFilesAdded} />
        <FileStatusList items={items} />
        {importError && (
          <p className="text-sm text-red-600 dark:text-red-400 px-1">{importError}</p>
        )}
        <ImportSummary results={items} onImport={handleImport} onClear={handleClear} />
      </div>
    </div>
  )
}
