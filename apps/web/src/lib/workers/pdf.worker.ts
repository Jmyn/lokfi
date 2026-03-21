/**
 * PDF text extraction Web Worker using pdfjs-dist.
 *
 * Vite native worker URL pattern:
 *   new URL('./pdf.worker.ts', import.meta.url)
 * This bundles the worker file and creates a valid worker instance.
 *
 * Communication protocol:
 *   Input:  { type: 'parse', buffer: ArrayBuffer }
 *   Output: { type: 'success', text: string } | { type: 'error', message: string }
 */

import * as pdfjsLib from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Use the locally bundled pdfjs worker served by Vite as a static asset.
// The ?url suffix tells Vite to copy the file to dist and return its public URL,
// avoiding any external CDN dependency at runtime.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

self.addEventListener('message', async (event: MessageEvent<{ type: string; buffer?: ArrayBuffer; id?: string }>) => {
  const { type, buffer, id } = event.data

  if (type !== 'parse' || !buffer) {
    postMessage({ type: 'error', message: 'Invalid message: expected { type: "parse", buffer: ArrayBuffer }', id })
    return
  }

  try {
    const loadingTask = pdfjsLib.getDocument({ data: buffer })
    const pdf = await loadingTask.promise

    const pageTexts: string[] = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      // Filter out TextMarkedContent items — only keep actual text items
      const textItems = content.items.filter((item): item is TextItem => 'str' in item)
      // pdfjs extracts items in reading order with position info.
      // We join with newlines based on Y-position changes to mimic line breaks.
      const pageText = reconstructText(textItems)
      pageTexts.push(pageText)
    }

    const fullText = pageTexts.join('\n\n--- Page Break ---\n\n')
    postMessage({ type: 'success', text: fullText, id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown PDF parsing error'
    postMessage({ type: 'error', message, id })
  }
})

/**
 * Reconstructs text from pdfjs text items, preserving line breaks based on
 * Y-coordinate changes. Items with similar Y values are on the same line.
 */
function reconstructText(items: TextItem[]): string {
  if (items.length === 0) return ''

  // Sort by Y position (descending - top of page first) then X (ascending - left to right).
  // Threshold of 1 PDF unit (~0.35mm) groups items on the same typographic line while
  // correctly splitting consecutive lines. Works for OCBC PDFs (10–12pt body text).
  // PDFs with very tight line spacing or fractional Y offsets may need a higher threshold.
  const sorted = [...items].sort((a, b) => {
    const yDiff = (b.transform[5] ?? 0) - (a.transform[5] ?? 0)
    if (Math.abs(yDiff) > 1) return yDiff
    return (a.transform[4] ?? 0) - (b.transform[4] ?? 0)
  })

  const lines: string[] = []
  let currentLine = ''
  let currentY: number | null = null

  for (const item of sorted) {
    const y = item.transform[5] ?? 0

    if (currentY === null) {
      // First item - start the first line
      currentY = y
      currentLine = item.str ?? ''
      continue
    }

    if (Math.abs(y - currentY) > 1) {
      // New line
      if (currentLine.trim()) lines.push(currentLine.trim())
      currentLine = item.str ?? ''
      currentY = y
    } else {
      // Same line - add space-separated
      const text = item.str ?? ''
      if (currentLine) currentLine += ' ' + text
      else currentLine = text
    }
  }

  if (currentLine.trim()) lines.push(currentLine.trim())
  return lines.join('\n')
}

export type {}
