import type { BrokeragePosition } from '@lokfi/brokerage-core'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PORTFOLIO_BUCKETS,
  buildBucketLookup,
  buildBucketOptions,
  createDefaultPortfolioBuckets,
  filterPositionsByBucket,
  getPortfolioBucketAggregation,
  getSecurityKey,
  isStockLikePosition,
  removeAssignmentsForBucket,
} from './portfolioBuckets'

function position(overrides: Partial<BrokeragePosition> = {}): BrokeragePosition {
  return {
    id: overrides.id ?? 'pos-1',
    source: overrides.source ?? 'test',
    symbol: overrides.symbol ?? 'AAPL',
    name: overrides.name ?? 'Apple Inc.',
    quantity: overrides.quantity ?? 10,
    avgCost: overrides.avgCost ?? 100,
    currency: overrides.currency ?? 'USD',
    secType: overrides.secType ?? 'STK',
    marketValue: overrides.marketValue,
    updatedAt: overrides.updatedAt ?? '2026-05-11T00:00:00.000Z',
  }
}

describe('portfolioBuckets', () => {
  it('defines sparse default portfolio buckets in display order', () => {
    expect(DEFAULT_PORTFOLIO_BUCKETS.map((bucket) => bucket.name)).toEqual(['Growth', 'Income', 'Cash'])
    expect(DEFAULT_PORTFOLIO_BUCKETS.map((bucket) => bucket.sortOrder)).toEqual([0, 1, 2])
  })

  it('builds a stock-like security key from secType and uppercased symbol', () => {
    expect(getSecurityKey(position({ symbol: 'aapl', secType: 'STK' }))).toBe('STK:AAPL')
    expect(getSecurityKey(position({ symbol: 'sgov', secType: undefined }))).toBe('STK:SGOV')
    expect(getSecurityKey(position({ symbol: 'AAPL', secType: 'FUND' }))).toBe('FUND:AAPL')
  })

  it('identifies stock-like positions and excludes derivatives', () => {
    expect(isStockLikePosition(position({ secType: 'STK' }))).toBe(true)
    expect(isStockLikePosition(position({ secType: 'FUND' }))).toBe(true)
    expect(isStockLikePosition(position({ secType: 'CASH' }))).toBe(true)
    expect(isStockLikePosition(position({ secType: 'OPT' }))).toBe(false)
    expect(isStockLikePosition(position({ secType: 'FUT' }))).toBe(false)
  })

  it('filters positions by assigned bucket and unassigned state', () => {
    const apple = position({ id: 'p1', symbol: 'AAPL' })
    const microsoft = position({ id: 'p2', symbol: 'MSFT' })
    const appleOption = position({ id: 'p3', symbol: 'AAPL', secType: 'OPT' })
    const assignments = [{ securityKey: 'STK:AAPL', bucketId: 'bucket_growth', createdAt: 'now', updatedAt: 'now' }]

    expect(filterPositionsByBucket([apple, microsoft, appleOption], assignments, 'all')).toEqual([
      apple,
      microsoft,
      appleOption,
    ])
    expect(filterPositionsByBucket([apple, microsoft, appleOption], assignments, 'bucket_growth')).toEqual([apple])
    expect(filterPositionsByBucket([apple, microsoft, appleOption], assignments, 'unassigned')).toEqual([microsoft])
  })

  it('removes assignments for a deleted bucket', () => {
    const assignments = [
      { securityKey: 'STK:AAPL', bucketId: 'bucket_growth', createdAt: 'now', updatedAt: 'now' },
      { securityKey: 'STK:MSFT', bucketId: 'bucket_income', createdAt: 'now', updatedAt: 'now' },
    ]

    expect(removeAssignmentsForBucket(assignments, 'bucket_growth')).toEqual([
      { securityKey: 'STK:MSFT', bucketId: 'bucket_income', createdAt: 'now', updatedAt: 'now' },
    ])
  })

  it('aggregates stock-like positions by bucket and excludes derivatives', () => {
    const buckets = [
      {
        id: 'bucket_growth',
        name: 'Growth',
        color: '#3b82f6',
        sortOrder: 0,
        isDefault: true,
        createdAt: 'now',
        updatedAt: 'now',
      },
      {
        id: 'bucket_income',
        name: 'Income',
        color: '#22c55e',
        sortOrder: 1,
        isDefault: true,
        createdAt: 'now',
        updatedAt: 'now',
      },
    ]
    const positions = [
      position({ id: 'p1', symbol: 'AAPL', marketValue: 1200 }),
      position({ id: 'p2', symbol: 'AAPL', marketValue: 800 }),
      position({ id: 'p3', symbol: 'SCHD', marketValue: 1000 }),
      position({ id: 'p4', symbol: 'AAPL', secType: 'OPT', marketValue: 500 }),
      position({ id: 'p5', symbol: 'MSFT', quantity: 2, avgCost: 300, marketValue: undefined }),
    ]
    const assignments = [
      { securityKey: 'STK:AAPL', bucketId: 'bucket_growth', createdAt: 'now', updatedAt: 'now' },
      { securityKey: 'STK:SCHD', bucketId: 'bucket_income', createdAt: 'now', updatedAt: 'now' },
    ]

    expect(getPortfolioBucketAggregation({ positions, buckets, assignments, convertValue: (value) => value })).toEqual([
      { bucketId: 'bucket_growth', name: 'Growth', color: '#3b82f6', value: 2000, pct: 55.55555555555556 },
      { bucketId: 'bucket_income', name: 'Income', color: '#22c55e', value: 1000, pct: 27.77777777777778 },
      { bucketId: 'unassigned', name: 'Unassigned', color: '#94a3b8', value: 600, pct: 16.666666666666664 },
    ])
  })

  it('builds bucket options with Unassigned after user buckets', () => {
    const lookup = buildBucketLookup(DEFAULT_PORTFOLIO_BUCKETS)
    expect(lookup.get('bucket_growth')?.name).toBe('Growth')
    expect(buildBucketOptions(DEFAULT_PORTFOLIO_BUCKETS).map((option) => option.label)).toEqual([
      'All buckets',
      'Growth',
      'Income',
      'Cash',
      'Unassigned',
    ])
  })
})

describe('createDefaultPortfolioBuckets', () => {
  it('stamps default buckets at migration time while keeping stable ids', () => {
    const buckets = createDefaultPortfolioBuckets('2026-05-11T12:00:00.000Z')

    expect(buckets).toEqual([
      {
        id: 'bucket_growth',
        name: 'Growth',
        color: '#3b82f6',
        sortOrder: 0,
        isDefault: true,
        createdAt: '2026-05-11T12:00:00.000Z',
        updatedAt: '2026-05-11T12:00:00.000Z',
      },
      {
        id: 'bucket_income',
        name: 'Income',
        color: '#22c55e',
        sortOrder: 1,
        isDefault: true,
        createdAt: '2026-05-11T12:00:00.000Z',
        updatedAt: '2026-05-11T12:00:00.000Z',
      },
      {
        id: 'bucket_cash',
        name: 'Cash',
        color: '#f59e0b',
        sortOrder: 2,
        isDefault: true,
        createdAt: '2026-05-11T12:00:00.000Z',
        updatedAt: '2026-05-11T12:00:00.000Z',
      },
    ])
  })
})
