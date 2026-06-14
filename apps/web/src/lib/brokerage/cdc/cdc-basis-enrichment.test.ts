import type { BrokerageFundDetail, BrokeragePosition, BrokerageTransaction } from '@lokfi/brokerage-core'
import { describe, expect, it } from 'vitest'
import { BASIS_DIAGNOSTICS_EXT_KEY, BASIS_QUALITY_EXT_KEY, computeCdcBasisEnrichment } from './cdc-basis-enrichment'

function position(overrides: Partial<BrokeragePosition>): BrokeragePosition {
  return {
    id: 'BTC_CRYPTO_cdc',
    source: 'cdc',
    symbol: 'BTC',
    secType: 'CRYPTO',
    currency: 'USD',
    quantity: 1,
    avgCost: 0,
    marketValue: 60_000,
    updatedAt: '2026-06-01T00:00:00Z',
    ...overrides,
  }
}

function trade(overrides: Partial<BrokerageTransaction>): BrokerageTransaction {
  return {
    id: 'cdc_t-1',
    source: 'cdc',
    orderId: 'o-1',
    symbol: 'BTC_USD',
    action: 'BUY',
    quantity: 1,
    price: 50_000,
    currency: 'USD',
    executedAt: '2026-03-01T00:00:00Z',
    secType: 'CRYPTO',
    ...overrides,
  }
}

function transfer(overrides: Partial<BrokerageFundDetail>): BrokerageFundDetail {
  return {
    id: 'cdc_fund_j-1',
    source: 'cdc',
    rawType: 'ONCHAIN_DEPOSIT',
    classifiedType: 'TRANSFER_IN',
    symbol: 'BTC',
    amount: 0.5,
    currency: 'USD',
    quantity: 0.5,
    businessDate: '2026-04-01T00:00:00Z',
    ...overrides,
  }
}

const noPrices = async () => null

describe('computeCdcBasisEnrichment', () => {
  it('fills avgCost and unrealized P&L from trade history', async () => {
    const result = await computeCdcBasisEnrichment(
      [position({ quantity: 1, marketValue: 60_000 })],
      [trade({ price: 50_000, commission: 50 })],
      [],
      noPrices
    )
    const pos = result.positions[0]
    expect(pos?.avgCost).toBe(50_050)
    expect(pos?.unrealizedPnl).toBe(60_000 - 50_050)
    expect(pos?.unrealizedPnlPercent).toBeCloseTo((60_000 - 50_050) / 50_050)

    const quality = result.extensions.find((e) => e.key === BASIS_QUALITY_EXT_KEY)
    expect(quality?.value).toBe(JSON.stringify('ok'))
  })

  it('values transferred-in coins at the deposit-date market price (estimated)', async () => {
    const prices = async (token: string, date: string) => {
      expect(token).toBe('BTC')
      expect(date).toBe('2026-04-01')
      return 55_000
    }
    const result = await computeCdcBasisEnrichment(
      [position({ quantity: 0.5, marketValue: 30_000 })],
      [],
      [transfer({})],
      prices
    )
    expect(result.positions[0]?.avgCost).toBe(55_000)
    const quality = result.extensions.find((e) => e.key === BASIS_QUALITY_EXT_KEY)
    expect(quality?.value).toBe(JSON.stringify('estimated'))
  })

  it('shares one basis pool across spot and staked positions of a token', async () => {
    const spot = position({ id: 'SOL_CRYPTO_cdc', symbol: 'SOL', quantity: 5, marketValue: 1_000 })
    const staked = position({
      id: 'SOL.staked_CRYPTO_cdc',
      symbol: 'SOL',
      quantity: 10,
      marketValue: 2_000,
      identifier: 'SOL.staked',
    })
    const result = await computeCdcBasisEnrichment(
      [spot, staked],
      [trade({ symbol: 'SOL_USD', quantity: 15, price: 100 })],
      [],
      noPrices
    )
    expect(result.positions).toHaveLength(2)
    for (const pos of result.positions) {
      expect(pos.avgCost).toBe(100)
    }
    const stakedPos = result.positions.find((p) => p.id === 'SOL.staked_CRYPTO_cdc')
    expect(stakedPos?.unrealizedPnl).toBe(2_000 - 10 * 100)
  })

  it('treats stablecoins as pegged with avgCost 1 and no diagnostics', async () => {
    const result = await computeCdcBasisEnrichment(
      [position({ id: 'USDT_CRYPTO_cdc', symbol: 'USDT', quantity: 1_000, marketValue: 1_000 })],
      [],
      [],
      noPrices
    )
    expect(result.positions[0]?.avgCost).toBe(1)
    const quality = result.extensions.find((e) => e.key === BASIS_QUALITY_EXT_KEY)
    expect(quality?.value).toBe(JSON.stringify('ok'))
  })

  it('reconciles against the exchange quantity when ledger history is missing', async () => {
    // 1 BTC held but no trades/transfers at all → synthetic acquisition at market
    const result = await computeCdcBasisEnrichment([position({ quantity: 1, marketValue: 60_000 })], [], [], noPrices)
    const pos = result.positions[0]
    // Reconciled at current market price (60_000 / 1)
    expect(pos?.avgCost).toBe(60_000)
    const quality = result.extensions.find((e) => e.key === BASIS_QUALITY_EXT_KEY)
    expect(quality?.value).toBe(JSON.stringify('incomplete'))
    const diags = result.extensions.find((e) => e.key === BASIS_DIAGNOSTICS_EXT_KEY)
    expect(JSON.parse(diags?.value ?? '[]').length).toBeGreaterThan(0)
  })

  it('values staking rewards from the reward record itself', async () => {
    const reward: BrokerageFundDetail = {
      id: 'cdc_fund_stk_1',
      source: 'cdc',
      rawType: 'STAKING_REWARD',
      classifiedType: 'DIVIDEND',
      symbol: 'SOL',
      amount: 15, // 0.1 SOL × $150
      currency: 'USD',
      quantity: 0.1,
      businessDate: '2026-05-01T00:00:00Z',
    }
    const result = await computeCdcBasisEnrichment(
      [position({ id: 'SOL_CRYPTO_cdc', symbol: 'SOL', quantity: 0.1, marketValue: 20 })],
      [],
      [reward],
      noPrices
    )
    expect(result.positions[0]?.avgCost).toBeCloseTo(150)
    const quality = result.extensions.find((e) => e.key === BASIS_QUALITY_EXT_KEY)
    expect(quality?.value).toBe(JSON.stringify('estimated'))
  })

  it('handles cross-pair trades via market-price valuation', async () => {
    const prices = async () => 3_000
    const result = await computeCdcBasisEnrichment(
      [position({ id: 'ETH_CRYPTO_cdc', symbol: 'ETH', quantity: 2, marketValue: 6_200 })],
      [trade({ symbol: 'ETH_BTC', quantity: 2, price: 0.05 })],
      [],
      prices
    )
    expect(result.positions[0]?.avgCost).toBe(3_000)
    const quality = result.extensions.find((e) => e.key === BASIS_QUALITY_EXT_KEY)
    expect(quality?.value).toBe(JSON.stringify('estimated'))
  })

  it('ignores positions and records from other sources', async () => {
    const tigerPos = position({ id: 'AAPL_STK_tiger', source: 'tiger', symbol: 'AAPL' })
    const result = await computeCdcBasisEnrichment([tigerPos], [], [], noPrices)
    expect(result.positions).toHaveLength(0)
    expect(result.extensions).toHaveLength(0)
  })
})
