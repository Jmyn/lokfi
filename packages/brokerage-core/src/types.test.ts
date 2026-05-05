import { describe, expect, it } from 'vitest'
import type {
  BrokerageAccount,
  BrokerageCredentials,
  BrokeragePosition,
  BrokeragePositionExtension,
  BrokerageSyncLog,
  BrokerageTransaction,
  SecurityType,
  SyncCategory,
  SyncStatus,
  TradeAction,
} from './types'

describe('BrokeragePosition', () => {
  it('creates position with required fields', () => {
    const position: BrokeragePosition = {
      id: 'AAPL_tiger',
      source: 'tiger',
      symbol: 'AAPL',
      currency: 'USD',
      quantity: 100,
      avgCost: 150,
      updatedAt: '2025-01-01T00:00:00.000Z',
    }
    expect(position.id).toBe('AAPL_tiger')
    expect(position.symbol).toBe('AAPL')
    expect(position.quantity).toBe(100)
    expect(position.avgCost).toBe(150)
    expect(position.source).toBe('tiger')
  })

  it('accepts optional fields', () => {
    const position: BrokeragePosition = {
      id: 'AAPL_tiger',
      source: 'tiger',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      secType: 'STK',
      currency: 'USD',
      quantity: 100,
      avgCost: 150,
      marketValue: 18000,
      unrealizedPnl: 3000,
      updatedAt: '2025-01-01T00:00:00.000Z',
    }
    expect(position.name).toBe('Apple Inc.')
    expect(position.secType).toBe('STK')
    expect(position.marketValue).toBe(18000)
    expect(position.unrealizedPnl).toBe(3000)
  })
})

describe('BrokerageTransaction', () => {
  it('creates transaction with all fields', () => {
    const txn: BrokerageTransaction = {
      id: 'tiger_123',
      source: 'tiger',
      orderId: '123',
      symbol: 'AAPL',
      action: 'BUY',
      quantity: 100,
      price: 150,
      currency: 'USD',
      commission: 1,
      executedAt: '2025-01-01T10:00:00.000Z',
    }
    expect(txn.id).toBe('tiger_123')
    expect(txn.action).toBe('BUY')
    expect(txn.quantity).toBe(100)
    expect(txn.price).toBe(150)
    expect(txn.commission).toBe(1)
  })

  it('omits optional commission field', () => {
    const txn: BrokerageTransaction = {
      id: 'tiger_456',
      source: 'tiger',
      orderId: '456',
      symbol: 'TSLA',
      action: 'SELL',
      quantity: 50,
      price: 200,
      currency: 'USD',
      executedAt: '2025-01-01T11:00:00.000Z',
    }
    expect(txn.commission).toBeUndefined()
  })
})

describe('BrokerageAccount', () => {
  it('creates account with currency and segType', () => {
    const account: BrokerageAccount = {
      id: 'tiger_USD_SEC',
      source: 'tiger',
      currency: 'USD',
      cashBalance: 10000,
      netLiquidation: 50000,
      segType: 'SEC',
      updatedAt: '2025-01-01T00:00:00.000Z',
    }
    expect(account.id).toBe('tiger_USD_SEC')
    expect(account.currency).toBe('USD')
    expect(account.segType).toBe('SEC')
    expect(account.cashBalance).toBe(10000)
    expect(account.netLiquidation).toBe(50000)
  })

  it('accepts FUT segType', () => {
    const account: BrokerageAccount = {
      id: 'tiger_USD_FUT',
      source: 'tiger',
      currency: 'USD',
      cashBalance: 5000,
      segType: 'FUT',
      updatedAt: '2025-01-01T00:00:00.000Z',
    }
    expect(account.segType).toBe('FUT')
  })
})

describe('BrokerageSyncLog', () => {
  it('creates success log', () => {
    const log: BrokerageSyncLog = {
      source: 'tiger',
      category: 'positions',
      status: 'success',
      lastSyncAt: '2025-01-01T12:00:00.000Z',
    }
    expect(log.status).toBe('success')
    expect(log.category).toBe('positions')
  })

  it('creates failure log with error message', () => {
    const log: BrokerageSyncLog = {
      source: 'tiger',
      category: 'transactions',
      status: 'failure',
      lastSyncAt: '2025-01-01T12:00:00.000Z',
      errorMessage: 'Network timeout',
    }
    expect(log.status).toBe('failure')
    expect(log.errorMessage).toBe('Network timeout')
  })

  it('creates in_progress log', () => {
    const log: BrokerageSyncLog = {
      source: 'tiger',
      category: 'account',
      status: 'in_progress',
      lastSyncAt: '2025-01-01T12:00:00.000Z',
    }
    expect(log.status).toBe('in_progress')
  })
})

describe('BrokerageCredentials', () => {
  it('creates credentials structure', () => {
    const creds: BrokerageCredentials = {
      id: 'tiger',
      encryptedData: 'abc123base64==',
      iv: 'def456base64==',
      salt: 'ghi789base64==',
    }
    expect(creds.id).toBe('tiger')
    expect(creds.encryptedData).toBe('abc123base64==')
    expect(creds.iv).toBe('def456base64==')
    expect(creds.salt).toBe('ghi789base64==')
  })
})

describe('Type unions', () => {
  it('SecurityType covers all expected values', () => {
    const types: SecurityType[] = ['STK', 'OPT', 'FUT', 'FOP', 'CASH', 'FUND', 'WAR', 'MLEG']
    expect(types).toHaveLength(8)
  })

  it('TradeAction is BUY or SELL', () => {
    const actions: TradeAction[] = ['BUY', 'SELL']
    expect(actions).toHaveLength(2)
  })

  it('SyncStatus covers all states', () => {
    const statuses: SyncStatus[] = ['success', 'failure', 'in_progress']
    expect(statuses).toHaveLength(3)
  })

  it('SyncCategory covers all categories', () => {
    const categories: SyncCategory[] = ['positions', 'transactions', 'fund_details', 'account']
    expect(categories).toHaveLength(4)
  })
})

describe('BrokeragePositionExtension', () => {
  it('creates extension record', () => {
    const ext: BrokeragePositionExtension = {
      positionId: 'AAPL_tiger',
      key: 'contractId',
      value: '"12345"',
    }
    expect(ext.positionId).toBe('AAPL_tiger')
    expect(ext.key).toBe('contractId')
    expect(ext.value).toBe('"12345"')
  })
})
