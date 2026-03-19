import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { ParserRegistry, CdcDebitParser, GenericCsvParser, ParseError, generateTransactionHash, CustomCsvParser, computeHeaderFingerprint } from '@lokfi/parser-core'
import type { Statement, CustomParserProfile } from '@lokfi/parser-core'
import { db } from '../../lib/db/db'
import type { DbTransaction } from '../../lib/db/db'
import { StorageManager } from '../../lib/db/StorageManager'
import { applyRulesToImport } from '../../lib/rules/applyRulesToImport'
import { UploadZone } from './UploadZone'
import { FileStatusList, type FileParseResult } from './FileStatusList'
import { ImportSummary } from './ImportSummary'
import { ParserConfigModal } from './ParserConfigModal'

export function ImportPage() {
  const [items, setItems] = useState<FileParseResult[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const [configuringItem, setConfiguringItem] = useState<FileParseResult | null>(null)
  const [dupStats, setDupStats] = useState<{ newCount: number; existingCount: number } | null>(null)

  useEffect(() => {
    StorageManager.initPersistence()
  }, [])

  const profiles = useLiveQuery(() => db.customParsers.toArray(), []) ?? []

  const registry = useMemo(() => {
    const r = new ParserRegistry()
    for (const profile of profiles) {
      r.register(new CustomCsvParser(profile))
    }
    r.register(new CdcDebitParser())
    r.registerFallback(new GenericCsvParser())
    return r
  }, [profiles])

  // Compute all transaction hashes for the given successful items (same logic as handleImport)
  const computeHashes = useCallback((successItems: FileParseResult[]): string[] => {
    const hashes: string[] = []
    for (const item of successItems) {
      if (!item.statement) continue
      const occurrenceCounts = new Map<string, number>()
      for (const txn of item.statement.transactions) {
        const key = `${txn.date}|${txn.description}|${txn.transactionValue}`
        const idx = occurrenceCounts.get(key) ?? 0
        occurrenceCounts.set(key, idx + 1)
        hashes.push(generateTransactionHash(txn, idx))
      }
    }
    return hashes
  }, [])

  // Recompute dedup stats whenever items settle (no files still parsing)
  useEffect(() => {
    const successItems = items.filter((i) => i.status === 'success' && i.statement)
    if (successItems.length === 0) { setDupStats(null); return }
    if (items.some((i) => i.status === 'parsing')) return

    const hashes = computeHashes(successItems)
    if (hashes.length === 0) { setDupStats(null); return }

    db.transactions.where('id').anyOf(hashes).count().then((existingCount) => {
      setDupStats({ newCount: hashes.length - existingCount, existingCount })
    })
  }, [items, computeHashes])

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

          // Check if a custom profile was matched (for badge display)
          const { data } = Papa.parse<string[]>(text, { skipEmptyLines: true })
          const fingerprint = computeHeaderFingerprint(data as string[][])
          const matchedProfile = profiles.find(p => p.headerFingerprint === fingerprint)

          updateItem(file, {
            status: 'success',
            transactionCount: statement.transactions.length,
            statement,
            rawText: text,
            profileName: matchedProfile?.name,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          updateItem(file, { status: 'error', error: message, rawText: text })
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
      const newCount = dupStats?.newCount ?? records.length
      const existingCount = dupStats?.existingCount ?? 0
      toast.success(
        existingCount > 0
          ? `Imported ${newCount} new transaction${newCount !== 1 ? 's' : ''} · ${existingCount} already existed`
          : `Imported ${newCount} transaction${newCount !== 1 ? 's' : ''}`,
      )
      handleClear()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save transactions'
      setImportError(message)
    }
  }

  function handleConfigureApply(statement: Statement, profile: CustomParserProfile) {
    if (!configuringItem) return
    updateItem(configuringItem.file, {
      status: 'success',
      transactionCount: statement.transactions.length,
      statement,
      rawText: configuringItem.rawText,
      profileName: profile.name,
    })
    setConfiguringItem(null)
  }

  function handleRemoveItem(item: FileParseResult) {
    setItems((prev) => prev.filter((i) => i.file !== item.file))
  }

  function handleClear() {
    setItems([])
    setImportError(null)
    setDupStats(null)
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
        <FileStatusList items={items} onConfigure={setConfiguringItem} onRemove={handleRemoveItem} />
        {importError && (
          <p className="text-sm text-red-600 dark:text-red-400 px-1">{importError}</p>
        )}
        <ImportSummary results={items} dupStats={dupStats} onImport={handleImport} onClear={handleClear} />
      </div>
      {configuringItem?.rawText && (
        <ParserConfigModal
          file={configuringItem.file}
          rawText={configuringItem.rawText}
          existingProfile={profiles.find(p => p.name === configuringItem.profileName)}
          onClose={() => setConfiguringItem(null)}
          onApply={handleConfigureApply}
        />
      )}
    </div>
  )
}
