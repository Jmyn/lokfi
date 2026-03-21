#!/usr/bin/env node
/**
 * Dev utility: extract raw text from a PDF using the same logic as pdf.worker.ts.
 *
 * Usage:
 *   node scripts/dump-pdf-text.mjs <path-to-pdf>
 *   node scripts/dump-pdf-text.mjs <path-to-pdf> -o <output-file>
 *
 * Without -o: prints per-page debug output + full joined text to stdout.
 * With -o:    writes only the clean full joined text to the output file (no debug headers).
 *             Use this to create fixture files for parser tests.
 *
 * Example — create a fixture file ready for redaction:
 *   node scripts/dump-pdf-text.mjs "statements/ocbc/credit/statement.pdf" \
 *     -o packages/parser-core/src/extractors/pdf/ocbc/__fixtures__/ocbc-credit-mmm-yy.txt
 *
 * Requires pdfjs-dist to be installed in apps/web.
 */

import { fileURLToPath, pathToFileURL } from 'url'
import path from 'path'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Use pdfjs-dist from apps/web — must convert Windows path to file:// URL
const pdfjsPath = path.join(__dirname, '../apps/web/node_modules/pdfjs-dist/legacy/build/pdf.mjs')
const pdfjsUrl = pathToFileURL(pdfjsPath).href

// Parse args: <pdf-path> [-o <output-path>]
const args = process.argv.slice(2)
const pdfFilePath = args[0]
const outputFlagIdx = args.indexOf('-o')
const outputFilePath = outputFlagIdx !== -1 ? args[outputFlagIdx + 1] : null

if (!pdfFilePath) {
  console.error('Usage: node scripts/dump-pdf-text.mjs <path-to-pdf> [-o <output-file>]')
  process.exit(1)
}

const absPath = path.resolve(pdfFilePath)
if (!fs.existsSync(absPath)) {
  console.error(`File not found: ${absPath}`)
  process.exit(1)
}

const pdfjsLib = await import(pdfjsUrl)
// Point workerSrc at the worker file so pdfjs can load it in Node.js
const workerPath = path.join(__dirname, '../apps/web/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href

const buffer = fs.readFileSync(absPath)
const data = new Uint8Array(buffer)

const loadingTask = pdfjsLib.getDocument({ data, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true })
const pdf = await loadingTask.promise

console.log(`Pages: ${pdf.numPages}\n`)

const pageTexts = []

for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i)
  const content = await page.getTextContent()
  const textItems = content.items.filter(item => 'str' in item)
  const pageText = reconstructText(textItems)
  pageTexts.push(pageText)
  if (!outputFilePath) {
    console.log(`=== PAGE ${i} ===`)
    console.log(pageText)
    console.log()
  }
}

const fullText = pageTexts.join('\n\n--- Page Break ---\n\n')

if (outputFilePath) {
  const absOutput = path.resolve(outputFilePath)
  fs.mkdirSync(path.dirname(absOutput), { recursive: true })
  fs.writeFileSync(absOutput, fullText + '\n')
  console.log(`Written to: ${absOutput}`)
  console.log(`Pages: ${pdf.numPages} | Lines: ${fullText.split('\n').length}`)
  console.log('Next: open the file, redact personal data, then commit.')
} else {
  console.log('\n\n=== FULL TEXT (all pages joined) ===')
  console.log(fullText)
}

/**
 * Mirrors the reconstructText function in pdf.worker.ts exactly.
 */
function reconstructText(items) {
  if (items.length === 0) return ''

  const sorted = [...items].sort((a, b) => {
    const yDiff = (b.transform[5] ?? 0) - (a.transform[5] ?? 0)
    if (Math.abs(yDiff) > 1) return yDiff
    return (a.transform[4] ?? 0) - (b.transform[4] ?? 0)
  })

  const lines = []
  let currentLine = ''
  let currentY = null

  for (const item of sorted) {
    const y = item.transform[5] ?? 0

    if (currentY === null) {
      currentY = y
      currentLine = item.str ?? ''
      continue
    }

    if (Math.abs(y - currentY) > 1) {
      if (currentLine.trim()) lines.push(currentLine.trim())
      currentLine = item.str ?? ''
      currentY = y
    } else {
      const text = item.str ?? ''
      if (currentLine) currentLine += ' ' + text
      else currentLine = text
    }
  }

  if (currentLine.trim()) lines.push(currentLine.trim())
  return lines.join('\n')
}
