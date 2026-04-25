import { describe, expect, it } from 'vitest'
import type { ConsolidatedTransaction, StatementSource, StatementType, Transaction } from './types'

describe('Type system', () => {
  it('StatementSource covers all supported banks', () => {
    const sources: StatementSource[] = ['ocbc', 'dbs', 'uob', 'citibank', 'cdc', 'maybank']
    expect(sources).toHaveLength(6)
  })

  it('StatementType is credit | debit', () => {
    const types: StatementType[] = ['credit', 'debit']
    expect(types).toHaveLength(2)
  })

  it('Transaction has correct shape with optional balance', () => {
    const txn: Transaction = {
      date: '2025-12-21',
      description: 'Ntuc Fp   Northshore Dr',
      transactionValue: -6.82,
    }
    expect(txn.balance).toBeUndefined()
    expect(typeof txn.transactionValue).toBe('number')
  })

  it('Transaction accepts optional balance field', () => {
    const txn: Transaction = {
      date: '2025-12-21',
      description: 'ATM Withdrawal',
      transactionValue: -100,
      balance: 1234.56,
    }
    expect(txn.balance).toBe(1234.56)
  })

  it('ConsolidatedTransaction extends Transaction with source, accountNo, hash', () => {
    const txn: ConsolidatedTransaction = {
      date: '2025-12-21',
      description: 'Ntuc Fp   Northshore Dr',
      transactionValue: -6.82,
      source: 'cdc',
      accountNo: 'CDC-CARD',
      hash: 'abc123',
    }
    expect(txn.source).toBe('cdc')
    expect(txn.hash).toBe('abc123')
    expect(txn.accountNo).toBe('CDC-CARD')
  })
})
