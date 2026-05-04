import type { BrokerageTransaction } from '@lokfi/brokerage-core'
import { describe, expect, it } from 'vitest'
import {
  adaptAsset,
  adaptAssetSegment,
  adaptCorpAction,
  adaptOrder,
  adaptOrderTransaction,
  adaptPosition,
} from './tiger-adapter'
import type {
  TigerAsset,
  TigerAssetSegment,
  TigerCorpAction,
  TigerOrder,
  TigerOrderTransaction,
  TigerPosition,
} from './tiger-types'

describe('adaptPosition', () => {
  it('maps TigerPosition to BrokeragePosition correctly', () => {
    const tigerPos: TigerPosition = {
      account: 'test-account',
      symbol: 'AAPL',
      secType: 'STK',
      currency: 'USD',
      position: 100,
      averageCost: 150.5,
      marketValue: 18000,
      unrealizedPnl: 2950,
    }

    const result = adaptPosition(tigerPos)

    expect(result.symbol).toBe('AAPL')
    expect(result.quantity).toBe(100)
    expect(result.marketValue).toBe(18000)
    expect(result.unrealizedPnl).toBe(2950)
    expect(result.avgCost).toBe(150.5)
    expect(result.currency).toBe('USD')
    expect(result.secType).toBe('STK')
  })

  it('generates correct id format with symbol_tiger', () => {
    const tigerPos: TigerPosition = {
      account: 'test-account',
      symbol: 'MSFT',
      secType: 'STK',
      currency: 'USD',
      position: 50,
      averageCost: 300,
    }

    const result = adaptPosition(tigerPos)

    expect(result.id).toBe('MSFT_tiger')
  })
})

describe('adaptOrder', () => {
  it('returns null when filledQuantity is 0', () => {
    const order: TigerOrder = {
      account: 'test-account',
      id: 1,
      orderId: 123,
      action: 'BUY',
      orderType: 'LMT',
      totalQuantity: 100,
      filledQuantity: 0,
      symbol: 'AAPL',
      secType: 'STK',
      timeInForce: 'DAY',
      outsideRth: false,
      currency: 'USD',
    }

    const result = adaptOrder(order)

    expect(result).toBeNull()
  })

  it('returns transaction when order has fills', () => {
    const order: TigerOrder = {
      account: 'test-account',
      id: 1,
      orderId: 456,
      action: 'BUY',
      orderType: 'LMT',
      totalQuantity: 100,
      filledQuantity: 50,
      avgFillPrice: 175,
      symbol: 'AAPL',
      secType: 'STK',
      timeInForce: 'DAY',
      outsideRth: false,
      currency: 'USD',
      latestTime: 1704067200000,
    }

    const result = adaptOrder(order)

    expect(result).not.toBeNull()
    expect((result as BrokerageTransaction).symbol).toBe('AAPL')
    expect((result as BrokerageTransaction).quantity).toBe(50)
    expect((result as BrokerageTransaction).price).toBe(175)
  })

  it('normalizes BUY action', () => {
    const order: TigerOrder = {
      account: 'test-account',
      orderId: 789,
      action: 'BUY',
      orderType: 'MKT',
      totalQuantity: 10,
      filledQuantity: 10,
      symbol: 'TSLA',
      secType: 'STK',
      timeInForce: 'DAY',
      outsideRth: false,
      currency: 'USD',
    }

    const result = adaptOrder(order)

    expect((result as BrokerageTransaction).action).toBe('BUY')
  })

  it('normalizes SELL action', () => {
    const order: TigerOrder = {
      account: 'test-account',
      orderId: 101,
      action: 'SELL',
      orderType: 'MKT',
      totalQuantity: 25,
      filledQuantity: 25,
      symbol: 'GOOG',
      secType: 'STK',
      timeInForce: 'DAY',
      outsideRth: false,
      currency: 'USD',
    }

    const result = adaptOrder(order)

    expect((result as BrokerageTransaction).action).toBe('SELL')
  })
})

describe('adaptOrderTransaction', () => {
  it('maps TigerOrderTransaction to BrokerageTransaction', () => {
    const txn: TigerOrderTransaction = {
      account: 'test-account',
      id: 1,
      orderId: 999,
      symbol: 'AAPL',
      action: 'BUY',
      quantity: 25,
      price: 180,
      currency: 'USD',
      tradeTime: 1704067200000,
    }

    const result = adaptOrderTransaction(txn)

    expect(result).not.toBeNull()
    expect((result as BrokerageTransaction).symbol).toBe('AAPL')
    expect((result as BrokerageTransaction).quantity).toBe(25)
    expect((result as BrokerageTransaction).price).toBe(180)
  })

  it('returns null when orderId is missing', () => {
    const txn: TigerOrderTransaction = {
      account: 'test-account',
      symbol: 'AAPL',
      action: 'BUY',
      quantity: 10,
      price: 150,
      currency: 'USD',
    }

    const result = adaptOrderTransaction(txn)

    expect(result).toBeNull()
  })
})

describe('adaptAsset', () => {
  it('maps asset to account with cashValue', () => {
    const asset: TigerAsset = {
      account: 'test-account',
      currency: 'USD',
      cashValue: 10000,
      netLiquidation: 50000,
    }

    const result = adaptAsset(asset)

    expect(result.source).toBe('tiger')
    expect(result.currency).toBe('USD')
    expect(result.cashBalance).toBe(10000)
    expect(result.netLiquidation).toBe(50000)
  })

  it('generates correct id format from currency only', () => {
    const asset: TigerAsset = {
      account: 'test-account',
      currency: 'HKD',
      cashValue: 20000,
    }

    const result = adaptAsset(asset)

    expect(result.id).toBe('tiger_HKD')
  })
})

describe('adaptAssetSegment', () => {
  it('maps segment category S to SEC', () => {
    const seg: TigerAssetSegment = {
      account: 'test-account',
      category: 'S',
      cashValue: 5000,
      netLiquidation: 30000,
    }

    const result = adaptAssetSegment(seg, 'USD')

    expect(result.segType).toBe('SEC')
    expect(result.cashBalance).toBe(5000)
  })

  it('maps segment category C to FUT', () => {
    const seg: TigerAssetSegment = {
      account: 'test-account',
      category: 'C',
      cashValue: 2000,
    }

    const result = adaptAssetSegment(seg, 'USD')

    expect(result.segType).toBe('FUT')
  })

  it('generates correct id format with segment', () => {
    const seg: TigerAssetSegment = {
      account: 'test-account',
      category: 'S',
    }

    const result = adaptAssetSegment(seg, 'HKD')

    expect(result.id).toBe('tiger_HKD_S')
  })
})

describe('adaptCorpAction', () => {
  it('classifies DIVIDEND from desc', () => {
    const corpAction: TigerCorpAction = {
      id: 1,
      account: 'test-account',
      currency: 'USD',
      amount: 24,
      desc: 'AAPL Dividend',
      businessDate: '2025-02-13',
    }

    const result = adaptCorpAction(corpAction)

    expect(result?.type).toBe('DIVIDEND')
  })

  it('classifies SPLIT from desc', () => {
    const corpAction: TigerCorpAction = {
      id: 2,
      account: 'test-account',
      amount: 4,
      desc: 'TSLA Split 4-for-1',
      businessDate: '2025-03-01',
    }

    const result = adaptCorpAction(corpAction)

    expect(result?.type).toBe('SPLIT')
  })

  it('defaults to OTHER for unknown desc', () => {
    const corpAction: TigerCorpAction = {
      id: 3,
      account: 'test-account',
      amount: 10,
      desc: 'Some random corporate action',
      businessDate: '2025-04-01',
    }

    const result = adaptCorpAction(corpAction)

    expect(result?.type).toBe('OTHER')
  })
})
