import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { FileParseResult } from './FileStatusList'
import { ImportPage } from './ImportPage'

vi.mock('../../lib/db/db', () => ({
  db: {
    customParsers: { toArray: async () => [] },
    transactions: { where: () => ({ anyOf: () => ({ count: async () => 0 }) }) },
  },
}))

vi.mock('../../lib/db/StorageManager', () => ({ StorageManager: { initPersistence: vi.fn() } }))

vi.mock('./FileStatusList', () => ({
  FileStatusList: ({ items }: { items: FileParseResult[] }) => items.map((item) => item.parserLabel).join(', '),
}))

vi.mock('../../lib/workers/usePdfWorker', () => ({
  usePdfWorker: () => ({
    parsePdf: async () => `Citibank Singapore Ltd
Statement Date January 08, 2026
CITI REWARDS MASTERCARD 0000 0000 0000 1234 Payment Due Date: February 02, 2026
DATE DESCRIPTION AMOUNT (SGD)
TRANSACTIONS FOR CITI REWARDS MASTERCARD
07 JAN OCBC SAMPLE MARKET 25.00
GRAND TOTAL`,
  }),
}))

it('auto-detects a Citibank PDF with OCBC in its transaction description', async () => {
  const file = new File([''], 'statement.pdf', { type: 'application/pdf' })
  file.arrayBuffer = async () => new ArrayBuffer(0)
  render(<ImportPage />)

  fireEvent.change(screen.getByLabelText('Upload CSV or PDF files'), { target: { files: [file] } })

  expect(await screen.findByText('Citibank Credit PDF')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Import All' })).toBeEnabled()
})
