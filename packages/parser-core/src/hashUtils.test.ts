import { describe, expect, it } from 'vitest'
import { generateTransactionHash } from './hashUtils'
import type { Transaction } from './types'

describe('generateTransactionHash', () => {
  const txn: Transaction = {
    date: '2025-12-21',
    description: 'Ntuc Fp   Northshore Dr',
    transactionValue: -6.82,
  }

  it('generates consistent hash for same input', () => {
    const hash1 = generateTransactionHash(txn, 0)
    const hash2 = generateTransactionHash(txn, 0)
    expect(hash1).toBe(hash2)
  })

  it('generates different hash for different occurrence index', () => {
    const hash1 = generateTransactionHash(txn, 0)
    const hash2 = generateTransactionHash(txn, 1)
    expect(hash1).not.toBe(hash2)
  })

  it('includes all relevant fields in the hash string', () => {
    const hash = generateTransactionHash(txn, 5)
    expect(hash).toContain('2025-12-21')
    expect(hash).toContain('Ntuc Fp   Northshore Dr')
    expect(hash).toContain('-6.82')
    expect(hash).toContain('5')
  })
})
