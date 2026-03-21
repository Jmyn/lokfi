#!/usr/bin/env node
/**
 * Dev utility: patches usePdfWorker to console.log raw extracted PDF text.
 *
 * Usage: node scripts/extract-pdf-text.mjs
 * After:  pnpm --filter web dev
 * Then:   import a PDF and check browser console for [PDF RAW TEXT]
 * Restore: mv apps/web/src/lib/workers/usePdfWorker.ts.bak apps/web/src/lib/workers/usePdfWorker.ts
 */

import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const targetPath = path.join(__dirname, '..', 'apps', 'web', 'src', 'lib', 'workers', 'usePdfWorker.ts')

const original = fs.readFileSync(targetPath, 'utf-8')

if (original.includes('[PDF RAW TEXT]')) {
  console.log('Already patched. Restore first: git checkout apps/web/src/lib/workers/usePdfWorker.ts')
  process.exit(1)
}

const patched = original.replace(
  'pending.resolve((event.data as WorkerSuccess).text)',
  `const text = (event.data as WorkerSuccess).text
          console.log('[PDF RAW TEXT]', text.length > 3000 ? text.slice(0, 3000) + '...[TRUNCATED ' + (text.length - 3000) + ' more chars]' : text)
          pending.resolve(text)`
)

fs.writeFileSync(targetPath + '.bak', original)
fs.writeFileSync(targetPath, patched)

console.log('Patched usePdfWorker.ts')
console.log('Run: pnpm --filter web dev')
console.log('Import a PDF and check browser console for [PDF RAW TEXT]')
console.log('Restore: git checkout apps/web/src/lib/workers/usePdfWorker.ts')
