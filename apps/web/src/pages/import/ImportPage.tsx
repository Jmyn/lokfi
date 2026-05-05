import {
  CdcDebitParser,
  CustomCsvParser,
  GenericCsvParser,
  GenericPdfParser,
  OcbcCreditPdfParser,
  PREDEFINED_SOURCES,
  ParseError,
  ParserRegistry,
  computeHeaderFingerprint,
  generateTransactionHash,
} from '@lokfi/parser-core'
import type { CustomParserProfile, ParserEntry, Statement, StatementParser } from '@lokfi/parser-core'
import { useLiveQuery } from 'dexie-react-hooks'
import Papa from 'papaparse'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { StorageManager } from '../../lib/db/StorageManager'
import { db } from '../../lib/db/db'
import type { DbTransaction } from '../../lib/db/db'
import { applyRulesToImport } from '../../lib/rules/applyRulesToImport'
import { usePdfWorker } from '../../lib/workers/usePdfWorker'
import { type FileParseResult, FileStatusList } from './FileStatusList'
import { ImportSummary } from './ImportSummary'
import { ParserConfigModal } from './ParserConfigModal'
import { UploadZone } from './UploadZone'

export function ImportPage() {
  const [items, setItems] = useState<FileParseResult[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const [configuringItem, setConfiguringItem] = useState<FileParseResult | null>(null)
  const [dupStats, setDupStats] = useState<{ newCount: number; existingCount: number } | null>(null)

  useEffect(() => {
    StorageManager.initPersistence()
  }, [])

  const profiles = useLiveQuery(() => db.customParsers.toArray(), []) ?? []

  const { parsePdf } = usePdfWorker()

  const registry = useMemo(() => {
    const r = new ParserRegistry()
    for (const profile of profiles) {
      r.register(new CustomCsvParser(profile))
    }
    r.register(new CdcDebitParser())
    r.register(new OcbcCreditPdfParser())
    r.register(new GenericPdfParser())
    r.registerFallback(new GenericCsvParser())
    return r
  }, [profiles])

  const customSources = useMemo(() => {
    const predefined = new Set(PREDEFINED_SOURCES)
    return [...new Set(profiles.map((p) => p.source).filter((s) => !predefined.has(s as never)))]
  }, [profiles])

  const availableParsers = useMemo<ParserEntry[]>(() => {
    return registry.getAll()
  }, [registry])

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
    if (successItems.length === 0) {
      setDupStats(null)
      return
    }
    if (items.some((i) => i.status === 'parsing')) return

    const hashes = computeHashes(successItems)
    if (hashes.length === 0) {
      setDupStats(null)
      return
    }

    db.transactions
      .where('id')
      .anyOf(hashes)
      .count()
      .then((existingCount) => {
        setDupStats({ newCount: hashes.length - existingCount, existingCount })
      })
  }, [items, computeHashes])

  function updateItem(file: File, patch: Partial<FileParseResult>) {
    setItems((prev) => prev.map((item) => (item.file === file ? { ...item, ...patch } : item)))
  }

  function handleFilesAdded(files: File[]) {
    const newItems: FileParseResult[] = files.map((file) => ({ file, status: 'pending' }))
    setItems((prev) => [...prev, ...newItems])

    files.forEach(async (file) => {
      updateItem(file, { status: 'parsing' })

      let parser: StatementParser | null = null
      let pdfBuffer: ArrayBuffer | undefined
      try {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

        if (isPdf) {
          // PDF: read as ArrayBuffer, extract text via worker, then parse
          const buffer = await file.arrayBuffer()
          pdfBuffer = buffer
          const extractedText = await parsePdf(buffer)
          parser = registry.getParser(extractedText)
          if (!parser) throw new ParseError('No parser found for this PDF')
          const statement = parser.parse(extractedText)

          updateItem(file, {
            status: 'success',
            transactionCount: statement.transactions.length,
            statement,
            rawText: extractedText,
            rawBuffer: buffer,
            parserLabel: parser.label,
          })
        } else {
          // CSV/text: read as text directly
          const text = await file.text()
          parser = registry.getParser(text)
          if (!parser) throw new ParseError('No parser found for this file')
          const statement = parser.parse(text)

          // Check if a custom profile was matched (for profileName backward compat)
          const { data } = Papa.parse<string[]>(text, { skipEmptyLines: true })
          const fingerprint = computeHeaderFingerprint(data as string[][])
          const matchedProfile = profiles.find((p) => p.headerFingerprint === fingerprint)

          updateItem(file, {
            status: 'success',
            transactionCount: statement.transactions.length,
            statement,
            rawText: text,
            profileName: matchedProfile?.name,
            parserLabel: parser.label,
          })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        updateItem(file, {
          status: 'error',
          error: message,
          rawBuffer: pdfBuffer,
          parserLabel: parser?.label,
        })
      }
    })
  }

  async function handleChangeParser(item: FileParseResult, parser: StatementParser) {
    updateItem(item.file, { status: 'parsing' })

    let buffer: ArrayBuffer | undefined
    try {
      const isPdf = item.file.type === 'application/pdf' || item.file.name.toLowerCase().endsWith('.pdf')
      let text: string

      if (isPdf) {
        buffer = item.rawBuffer ?? (await item.file.arrayBuffer())
        text = await parsePdf(buffer)
      } else {
        text = item.rawText ?? (await item.file.text())
      }

      const statement = parser.parse(text)

      // For CSV: check if the new parser matched a custom profile (profileName backward compat)
      let matchedProfileName: string | undefined
      if (!isPdf) {
        const { data } = Papa.parse<string[]>(text, { skipEmptyLines: true })
        const fingerprint = computeHeaderFingerprint(data as string[][])
        const matchedProfile = profiles.find((p) => p.headerFingerprint === fingerprint)
        matchedProfileName = matchedProfile?.name
      }

      updateItem(item.file, {
        status: 'success',
        transactionCount: statement.transactions.length,
        statement,
        rawText: text,
        rawBuffer: buffer,
        profileName: matchedProfileName,
        parserLabel: parser.label,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      updateItem(item.file, {
        status: 'error',
        error: message,
        rawBuffer: buffer,
        parserLabel: parser.label,
      })
    }
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
          accountNo: txn.accountNo ?? stmt.accountNo,
          date: txn.date,
          description: txn.description,
          transactionValue: txn.transactionValue,
          balance: txn.balance,
          importedAt,
        })
      }
    }

    try {
      // Preserve category fields from existing records that would be overwritten
      const existingRecords = await db.transactions.bulkGet(records.map((r) => r.id))
      for (let i = 0; i < records.length; i++) {
        const existing = existingRecords[i]
        if (existing) {
          if (existing.category) records[i].category = existing.category
          if (existing.manualCategory) records[i].manualCategory = existing.manualCategory
        }
      }

      await db.transactions.bulkPut(records)
      await applyRulesToImport(records.map((r) => r.id))
      const newCount = dupStats?.newCount ?? records.length
      const existingCount = dupStats?.existingCount ?? 0
      toast.success(
        existingCount > 0
          ? `Imported ${newCount} new transaction${newCount !== 1 ? 's' : ''} · ${existingCount} already existed`
          : `Imported ${newCount} transaction${newCount !== 1 ? 's' : ''}`
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
      parserLabel: profile.name,
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
            Upload CSV or PDF transaction history to import transactions.
          </p>
        </div>
        <UploadZone onFilesAdded={handleFilesAdded} />
        <FileStatusList
          items={items}
          availableParsers={availableParsers}
          onConfigure={setConfiguringItem}
          onRemove={handleRemoveItem}
          onChangeParser={handleChangeParser}
        />
        {importError && <p className="text-sm text-red-600 dark:text-red-400 px-1">{importError}</p>}
        <ImportSummary results={items} dupStats={dupStats} onImport={handleImport} onClear={handleClear} />
      </div>
      {configuringItem?.rawText && (
        <ParserConfigModal
          file={configuringItem.file}
          rawText={configuringItem.rawText}
          existingProfile={profiles.find((p) => p.name === configuringItem.profileName)}
          customSources={customSources}
          onClose={() => setConfiguringItem(null)}
          onApply={handleConfigureApply}
        />
      )}
    </div>
  )
}
