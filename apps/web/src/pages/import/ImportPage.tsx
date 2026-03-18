import { useState } from 'react'
import { ParserRegistry, CdcDebitParser, ParseError } from '@lokfi/parser-core'
import { UploadZone } from './UploadZone'
import { FileStatusList, type FileParseResult } from './FileStatusList'
import { ImportSummary } from './ImportSummary'

const registry = new ParserRegistry()
registry.register(new CdcDebitParser())

export function ImportPage() {
  const [items, setItems] = useState<FileParseResult[]>([])

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
          updateItem(file, { status: 'success', transactionCount: statement.transactions.length })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          updateItem(file, { status: 'error', error: message })
        }
      }
      reader.onerror = () => updateItem(file, { status: 'error', error: 'Failed to read file' })
      reader.readAsText(file)
    })
  }

  function handleImport() {
    // stub — persistence wired in Phase 1D
  }

  function handleClear() {
    setItems([])
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-12">
      <div className="mx-auto max-w-2xl flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Import Statements
        </h1>
        <UploadZone onFilesAdded={handleFilesAdded} />
        <FileStatusList items={items} />
        <ImportSummary results={items} onImport={handleImport} onClear={handleClear} />
      </div>
    </div>
  )
}
