import type { BrokerageCorpAction, BrokerageTransaction } from '@lokfi/brokerage-core'
import { describe, expect, it } from 'vitest'
import type { DbTransaction } from '../db/db'
import { mapBankTransaction, mapBrokerageTransaction, mapCorpAction } from './unifiedTransactions'

describe('mapBankTransaction', () => {
  it('maps a bank transaction correctly', () => {
    const t: DbTransaction = {
      id: 'txn-1',
      hash: 'txn-1',
      source: 'dbs',
      accountNo: '123-4-56789-0',
      date: '2024-03-15',
      description: 'Grocery Store',
      transactionValue: -45.67,
      importedAt: '2024-03-15T10:00:00Z',
    }
    const row = mapBankTransaction(t)
    expect(row.id).toBe('txn-1')
    expect(row.source).toBe('dbs')
    expect(row.date).toBe('2024-03-15T00:00:00Z')
    expect(row.description).toBe('Grocery Store')
    expect(row.amount).toBe(-45.67)
    expect(row.currency).toBe('SGD')
    expect(row.type).toBe('BANK')
    expect(row.isBank).toBe(true)
    expect(row.originalBank).toBe(t)
  })
})

describe('mapBrokerageTransaction', () => {
  it('maps a BUY transaction with commission', () => {
    const t: BrokerageTransaction = {
      id: 'order-1',
      source: 'tiger',
      orderId: 'order-1',
      symbol: 'AAPL',
      action: 'BUY',
      quantity: 10,
      price: 185,
      currency: 'USD',
      commission: 1.5,
      executedAt: '2024-03-15T14:30:00Z',
    }
    const rows = mapBrokerageTransaction(t)
    expect(rows).toHaveLength(2)

    const main = rows[0]!
    expect(main.type).toBe('BUY')
    expect(main.symbol).toBe('AAPL')
    expect(main.amount).toBe(-(10 * 185 + 1.5))
    expect(main.currency).toBe('USD')
    expect(main.description).toBe('BUY AAPL — 10 shares @ $185.00')

    const fee = rows[1]!
    expect(fee.type).toBe('FEE')
    expect(fee.amount).toBe(-1.5)
    expect(fee.description).toBe('Commission Fee — $1.50')
  })

  it('maps a SELL transaction without commission', () => {
    const t: BrokerageTransaction = {
      id: 'order-2',
      source: 'tiger',
      orderId: 'order-2',
      symbol: 'NVDA',
      action: 'SELL',
      quantity: 5,
      price: 245,
      currency: 'USD',
      executedAt: '2024-03-16T10:00:00Z',
    }
    const rows = mapBrokerageTransaction(t)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.type).toBe('SELL')
    expect(rows[0]!.amount).toBe(5 * 245)
    expect(rows[0]!.description).toBe('SELL NVDA — 5 shares @ $245.00')
  })
})

describe('mapCorpAction', () => {
  it('maps a DIVIDEND corp action', () => {
    const a: BrokerageCorpAction = {
      id: 'ca-1',
      source: 'tiger',
      symbol: 'AAPL',
      type: 'DIVIDEND',
      amount: 12.5,
      currency: 'USD',
      payDate: '2024-03-20',
      appliedAt: '2024-03-20T12:00:00Z',
    }
    const rows = mapCorpAction(a)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.type).toBe('DIVIDEND')
    expect(rows[0]!.amount).toBe(12.5)
    expect(rows[0]!.description).toBe('AAPL Dividend — $12.50')
  })

  it('maps a SPLIT corp action', () => {
    const a: BrokerageCorpAction = {
      id: 'ca-2',
      source: 'tiger',
      symbol: 'AAPL',
      type: 'SPLIT',
      appliedAt: '2024-03-21T08:00:00Z',
    }
    const rows = mapCorpAction(a)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.type).toBe('SPLIT')
    expect(rows[0]!.amount).toBe(0)
    expect(rows[0]!.description).toBe('AAPL SPLIT')
  })
})

describe('date sorting', () => {
  it('sorts bank and brokerage rows by date descending', () => {
    const bank: DbTransaction = {
      id: 'b1',
      hash: 'b1',
      source: 'dbs',
      accountNo: '1',
      date: '2024-03-10',
      description: 'Old',
      transactionValue: -10,
      importedAt: '2024-03-10T00:00:00Z',
    }
    const brokerage: BrokerageTransaction = {
      id: 't1',
      source: 'tiger',
      orderId: 't1',
      symbol: 'X',
      action: 'BUY',
      quantity: 1,
      price: 1,
      currency: 'USD',
      executedAt: '2024-03-15T12:00:00Z',
    }
    const dividend: BrokerageCorpAction = {
      id: 'd1',
      source: 'tiger',
      symbol: 'X',
      type: 'DIVIDEND',
      amount: 5,
      appliedAt: '2024-03-12T00:00:00Z',
    }

    const rows = [mapBankTransaction(bank), ...mapBrokerageTransaction(brokerage), ...mapCorpAction(dividend)]
    rows.sort((a, b) => b.date.localeCompare(a.date))

    expect(rows[0]!.date).toBe('2024-03-15T12:00:00Z')
    expect(rows[1]!.date).toBe('2024-03-12T00:00:00Z')
    expect(rows[2]!.date).toBe('2024-03-10T00:00:00Z')
  })
})
