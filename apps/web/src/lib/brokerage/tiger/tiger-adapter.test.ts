import type { BrokerageFundDetail, BrokerageTransaction } from '@lokfi/brokerage-core'
import { describe, expect, it } from 'vitest'
import {
  adaptAsset,
  adaptAssetSegment,
  adaptFundDetail,
  adaptOrder,
  adaptOrderTransaction,
  adaptPosition,
  classifyFundType,
  enrichTradeFundDetail,
  extractActionFromDesc,
  extractSymbolFromDesc,
} from './tiger-adapter'
import type {
  TigerAsset,
  TigerAssetSegment,
  TigerFundDetail,
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
    // Option fields should be undefined for stock positions
    expect(result.identifier).toBeUndefined()
    expect(result.multiplier).toBeUndefined()
    expect(result.contractId).toBeUndefined()
  })

  it('generates id with symbol_secType_source format', () => {
    const tigerPos: TigerPosition = {
      account: 'test-account',
      symbol: 'MSFT',
      secType: 'STK',
      currency: 'USD',
      position: 50,
      averageCost: 300,
    }

    const result = adaptPosition(tigerPos)

    expect(result.id).toBe('MSFT_STK_tiger')
  })

  it('includes secType in id so stock and option positions do not collide', () => {
    const stock: TigerPosition = {
      account: 'test-account',
      symbol: 'CRWV',
      secType: 'STK',
      currency: 'USD',
      position: 50,
      averageCost: 85.12,
    }
    const option: TigerPosition = {
      account: 'test-account',
      symbol: 'CRWV',
      secType: 'OPT',
      currency: 'USD',
      position: -1,
      averageCost: 5.29,
      identifier: 'CRWV  260508P00106000',
      multiplier: 100,
      contractId: 421026041,
    }

    const stockResult = adaptPosition(stock)
    const optionResult = adaptPosition(option)

    expect(stockResult.id).toBe('CRWV_STK_tiger')
    expect(optionResult.id).toBe('OPT_CRWV_260508P00106000_tiger')
    expect(stockResult.id).not.toBe(optionResult.id)
    // Option fields mapped correctly
    expect(optionResult.identifier).toBe('CRWV  260508P00106000')
    expect(optionResult.multiplier).toBe(100)
    expect(optionResult.contractId).toBe(421026041)
    expect(stockResult.identifier).toBeUndefined()
  })

  it('generates unique ids for multiple option contracts on same underlying', () => {
    const opt1: TigerPosition = {
      account: 'test-account',
      symbol: 'GRAB',
      secType: 'OPT',
      currency: 'USD',
      position: -13,
      averageCost: 0.15,
      identifier: 'GRAB  260508C00004000',
      multiplier: 100,
      contractId: 416667521,
    }
    const opt2: TigerPosition = {
      account: 'test-account',
      symbol: 'GRAB',
      secType: 'OPT',
      currency: 'USD',
      position: -10,
      averageCost: 0.15,
      identifier: 'GRAB  260508C00004500',
      multiplier: 100,
      contractId: 416667513,
    }

    const r1 = adaptPosition(opt1)
    const r2 = adaptPosition(opt2)

    expect(r1.id).toBe('OPT_GRAB_260508C00004000_tiger')
    expect(r2.id).toBe('OPT_GRAB_260508C00004500_tiger')
    expect(r1.id).not.toBe(r2.id)
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

describe('classifyFundType', () => {
  it('classifies "Dividend" → DIVIDEND', () => {
    expect(classifyFundType('Dividend')).toBe('DIVIDEND')
  })

  it('classifies "Dividend Tax" → DIVIDEND_TAX', () => {
    expect(classifyFundType('Dividend Tax')).toBe('DIVIDEND_TAX')
  })

  it('classifies "Trade" → TRADE', () => {
    expect(classifyFundType('Trade')).toBe('TRADE')
  })

  it('classifies "Commission" → FEE', () => {
    expect(classifyFundType('Commission')).toBe('FEE')
  })

  it('classifies "Platform Fee" → FEE', () => {
    expect(classifyFundType('Platform Fee')).toBe('FEE')
  })

  it('classifies "Funds Transfer In" → TRANSFER_IN', () => {
    expect(classifyFundType('Funds Transfer In')).toBe('TRANSFER_IN')
  })

  it('classifies "Campaign Subsidy" → REBATE', () => {
    expect(classifyFundType('Campaign Subsidy')).toBe('REBATE')
  })

  it('classifies "Currency Exchange - Quotation Currency" → CURRENCY_EXCHANGE', () => {
    expect(classifyFundType('Currency Exchange - Quotation Currency')).toBe('CURRENCY_EXCHANGE')
  })

  it('classifies "Currency Exchange - Base Currency" → CURRENCY_EXCHANGE', () => {
    expect(classifyFundType('Currency Exchange - Base Currency')).toBe('CURRENCY_EXCHANGE')
  })

  it('classifies "Deposit" → DEPOSIT_WITHDRAWAL', () => {
    expect(classifyFundType('Deposit')).toBe('DEPOSIT_WITHDRAWAL')
  })

  it('classifies "Funds Transfer Out" → TRANSFER_OUT', () => {
    expect(classifyFundType('Funds Transfer Out')).toBe('TRANSFER_OUT')
  })

  it('classifies unknown type → UNKNOWN with warning', () => {
    expect(classifyFundType('UnknownThing')).toBe('UNKNOWN')
  })

  it('handles undefined → UNKNOWN', () => {
    expect(classifyFundType(undefined)).toBe('UNKNOWN')
  })
})

describe('extractSymbolFromDesc', () => {
  it('extracts "AVGO" from "Buy-AVGO"', () => {
    expect(extractSymbolFromDesc('Buy-AVGO')).toBe('AVGO')
  })

  it('extracts "XDTE" from "XDTE-DIVIDEND"', () => {
    expect(extractSymbolFromDesc('XDTE-DIVIDEND')).toBe('XDTE')
  })

  it('extracts "AAPL" from "Sell-AAPL"', () => {
    expect(extractSymbolFromDesc('Sell-AAPL')).toBe('AAPL')
  })

  it('returns "" for undefined desc', () => {
    expect(extractSymbolFromDesc(undefined)).toBe('')
  })
})

describe('extractActionFromDesc', () => {
  it('extracts "BUY" from "Buy-AVGO"', () => {
    expect(extractActionFromDesc('Buy-AVGO')).toBe('BUY')
  })

  it('extracts "SELL" from "Sell-AAPL"', () => {
    expect(extractActionFromDesc('Sell-AAPL')).toBe('SELL')
  })

  it('returns undefined for "XDTE-DIVIDEND"', () => {
    expect(extractActionFromDesc('XDTE-DIVIDEND')).toBeUndefined()
  })

  it('returns undefined for undefined desc', () => {
    expect(extractActionFromDesc(undefined)).toBeUndefined()
  })
})

describe('adaptFundDetail', () => {
  it('adapts Dividend record', () => {
    const fundDetail: TigerFundDetail = {
      id: 1,
      account: 'test-account',
      currency: 'USD',
      amount: 94.15,
      desc: 'XDTE-DIVIDEND',
      type: 'Dividend',
      businessDate: '2025-04-15',
    }

    const result = adaptFundDetail(fundDetail)

    expect(result).not.toBeNull()
    expect((result as BrokerageFundDetail).classifiedType).toBe('DIVIDEND')
    expect((result as BrokerageFundDetail).symbol).toBe('XDTE')
    expect((result as BrokerageFundDetail).amount).toBe(94.15)
  })

  it('adapts Dividend Tax withheld (negative)', () => {
    const fundDetail: TigerFundDetail = {
      id: 2,
      account: 'test-account',
      currency: 'USD',
      amount: -28.24,
      desc: 'XDTE-DIVIDEND',
      type: 'Dividend Tax',
      businessDate: '2025-04-15',
    }

    const result = adaptFundDetail(fundDetail)

    expect(result).not.toBeNull()
    expect((result as BrokerageFundDetail).classifiedType).toBe('DIVIDEND_TAX')
    expect((result as BrokerageFundDetail).amount).toBe(-28.24)
  })

  it('adapts Dividend Tax refund (positive)', () => {
    const fundDetail: TigerFundDetail = {
      id: 3,
      account: 'test-account',
      currency: 'USD',
      amount: 5.0,
      desc: 'XDTE-DIVIDEND',
      type: 'Dividend Tax',
      businessDate: '2025-04-15',
    }

    const result = adaptFundDetail(fundDetail)

    expect(result).not.toBeNull()
    expect((result as BrokerageFundDetail).classifiedType).toBe('DIVIDEND_TAX')
    expect((result as BrokerageFundDetail).amount).toBe(5.0)
  })

  it('adapts Commission', () => {
    const fundDetail: TigerFundDetail = {
      id: 4,
      account: 'test-account',
      currency: 'USD',
      amount: -1.99,
      desc: 'Buy-AVGO',
      type: 'Commission',
      businessDate: '2025-04-15',
    }

    const result = adaptFundDetail(fundDetail)

    expect(result).not.toBeNull()
    expect((result as BrokerageFundDetail).classifiedType).toBe('FEE')
    expect((result as BrokerageFundDetail).rawType).toBe('Commission')
    expect((result as BrokerageFundDetail).symbol).toBe('AVGO')
  })

  it('adapts Platform Fee', () => {
    const fundDetail: TigerFundDetail = {
      id: 5,
      account: 'test-account',
      currency: 'USD',
      amount: -0.99,
      type: 'Platform Fee',
      businessDate: '2025-04-15',
    }

    const result = adaptFundDetail(fundDetail)

    expect(result).not.toBeNull()
    expect((result as BrokerageFundDetail).classifiedType).toBe('FEE')
  })

  it('adapts Trade', () => {
    const fundDetail: TigerFundDetail = {
      id: 6,
      account: 'test-account',
      currency: 'USD',
      amount: -2008.8,
      desc: 'Buy-AVGO',
      type: 'Trade',
      businessDate: '2025-04-15',
    }

    const result = adaptFundDetail(fundDetail)

    expect(result).not.toBeNull()
    expect((result as BrokerageFundDetail).classifiedType).toBe('TRADE')
    expect((result as BrokerageFundDetail).action).toBe('BUY')
  })

  it('adapts GST', () => {
    const fundDetail: TigerFundDetail = {
      id: 7,
      account: 'test-account',
      currency: 'USD',
      amount: -0.16,
      type: 'GST',
      businessDate: '2025-04-15',
    }

    const result = adaptFundDetail(fundDetail)

    expect(result).not.toBeNull()
    expect((result as BrokerageFundDetail).classifiedType).toBe('FEE')
  })

  it('adapts Transfer In', () => {
    const fundDetail: TigerFundDetail = {
      id: 8,
      account: 'test-account',
      currency: 'USD',
      amount: 20.29,
      type: 'Funds Transfer In',
      businessDate: '2025-04-15',
    }

    const result = adaptFundDetail(fundDetail)

    expect(result).not.toBeNull()
    expect((result as BrokerageFundDetail).classifiedType).toBe('TRANSFER_IN')
  })

  it('adapts Campaign Subsidy', () => {
    const fundDetail: TigerFundDetail = {
      id: 9,
      account: 'test-account',
      currency: 'USD',
      amount: 0.5,
      type: 'Campaign Subsidy',
      businessDate: '2025-04-15',
    }

    const result = adaptFundDetail(fundDetail)

    expect(result).not.toBeNull()
    expect((result as BrokerageFundDetail).classifiedType).toBe('REBATE')
  })

  it('adapts unknown type as UNKNOWN (not fee)', () => {
    const fundDetail: TigerFundDetail = {
      id: 10,
      account: 'test-account',
      currency: 'USD',
      amount: -5.0,
      type: 'UnknownThing',
      businessDate: '2025-04-15',
    }

    const result = adaptFundDetail(fundDetail)

    expect(result).not.toBeNull()
    expect((result as BrokerageFundDetail).classifiedType).toBe('UNKNOWN')
  })

  it('returns null when id is undefined', () => {
    const fundDetail: TigerFundDetail = {
      account: 'test-account',
      currency: 'USD',
      amount: 94.15,
      desc: 'XDTE-DIVIDEND',
      type: 'Dividend',
      businessDate: '2025-04-15',
    }

    const result = adaptFundDetail(fundDetail)

    expect(result).toBeNull()
  })

  it('returns null when businessDate is missing', () => {
    const fundDetail: TigerFundDetail = {
      id: 1,
      account: 'test-account',
      currency: 'USD',
      amount: 94.15,
      desc: 'XDTE-DIVIDEND',
      type: 'Dividend',
    }

    const result = adaptFundDetail(fundDetail)

    expect(result).toBeNull()
  })
})

describe('enrichTradeFundDetail', () => {
  it('enriches TRADE fund detail with matching filled order', () => {
    const filledOrder: BrokerageTransaction = {
      id: 'tiger_123',
      source: 'tiger',
      orderId: '123',
      symbol: 'AVGO',
      action: 'BUY',
      quantity: 10,
      price: 200.88,
      currency: 'USD',
      commission: 0,
      executedAt: '2025-04-15T10:00:00Z',
    }

    const fundDetail: BrokerageFundDetail = {
      id: 'tiger_fund_1',
      source: 'tiger',
      rawType: 'Trade',
      classifiedType: 'TRADE',
      symbol: 'AVGO',
      amount: -2008.8,
      currency: 'USD',
      action: 'BUY',
      businessDate: '2025-04-15',
    }

    const result = enrichTradeFundDetail(fundDetail, [filledOrder])

    expect(result.quantity).toBe(10)
    expect(result.price).toBe(200.88)
  })

  it('does not modify non-TRADE fund details', () => {
    const fundDetail: BrokerageFundDetail = {
      id: 'tiger_fund_2',
      source: 'tiger',
      rawType: 'Dividend',
      classifiedType: 'DIVIDEND',
      symbol: 'XDTE',
      amount: 94.15,
      currency: 'USD',
      businessDate: '2025-04-15',
    }

    const filledOrder: BrokerageTransaction = {
      id: 'tiger_123',
      source: 'tiger',
      orderId: '123',
      symbol: 'AVGO',
      action: 'BUY',
      quantity: 10,
      price: 200.88,
      currency: 'USD',
      commission: 0,
      executedAt: '2025-04-15T10:00:00Z',
    }

    const result = enrichTradeFundDetail(fundDetail, [filledOrder])

    expect(result.quantity).toBeUndefined()
    expect(result.price).toBeUndefined()
  })

  it('returns unenriched when no matching filled order found', () => {
    const fundDetail: BrokerageFundDetail = {
      id: 'tiger_fund_3',
      source: 'tiger',
      rawType: 'Trade',
      classifiedType: 'TRADE',
      symbol: 'AVGO',
      amount: -2008.8,
      currency: 'USD',
      action: 'BUY',
      businessDate: '2025-04-15',
    }

    const filledOrder: BrokerageTransaction = {
      id: 'tiger_456',
      source: 'tiger',
      orderId: '456',
      symbol: 'AAPL', // different symbol
      action: 'BUY',
      quantity: 10,
      price: 200.88,
      currency: 'USD',
      commission: 0,
      executedAt: '2025-04-15T10:00:00Z',
    }

    const result = enrichTradeFundDetail(fundDetail, [filledOrder])

    expect(result.quantity).toBeUndefined()
    expect(result.price).toBeUndefined()
  })

  it('selects closest amount match for multiple matches', () => {
    const fundDetail: BrokerageFundDetail = {
      id: 'tiger_fund_4',
      source: 'tiger',
      rawType: 'Trade',
      classifiedType: 'TRADE',
      symbol: 'AVGO',
      amount: -2008.8,
      currency: 'USD',
      action: 'BUY',
      businessDate: '2025-04-15',
    }

    const closerOrder: BrokerageTransaction = {
      id: 'tiger_789',
      source: 'tiger',
      orderId: '789',
      symbol: 'AVGO',
      action: 'BUY',
      quantity: 10,
      price: 200.88,
      currency: 'USD',
      commission: 0,
      executedAt: '2025-04-15T10:00:00Z',
    }

    // This order has gross = 10 * 200.88 + 0 = 2008.8 (exact match)
    const fartherOrder: BrokerageTransaction = {
      id: 'tiger_101',
      source: 'tiger',
      orderId: '101',
      symbol: 'AVGO',
      action: 'BUY',
      quantity: 12,
      price: 180.0,
      currency: 'USD',
      commission: 0,
      executedAt: '2025-04-15T10:00:00Z',
    }

    // Gross = 12 * 180 = 2160, diff from 2008.8 = 151.2

    const result = enrichTradeFundDetail(fundDetail, [fartherOrder, closerOrder])

    expect(result.quantity).toBe(10)
    expect(result.price).toBe(200.88)
  })
})
