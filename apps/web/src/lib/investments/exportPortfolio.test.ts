import { describe, expect, it, vi } from 'vitest'
import type { LokfiDatabase } from '../db/db'
import { type PortfolioExportData, createPortfolioExport, formatPortfolioExport } from './exportPortfolio'
import { createDefaultPortfolioBuckets } from './portfolioBuckets'

const exportedAt = new Date('2026-09-08T01:02:03.000Z')
const fetchedAt = '2026-09-01T10:00:00.000Z'

function fixture(): PortfolioExportData {
  return {
    positions: [
      {
        id: 'private-position-id',
        source: 'tiger',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        secType: 'STK',
        currency: 'USD',
        quantity: 10,
        avgCost: 150,
        marketValue: 2000,
        unrealizedPnl: 500,
        unrealizedPnlPercent: 33.33,
        updatedAt: fetchedAt,
      },
    ],
    accounts: [
      { id: 'private-account-number', source: 'tiger', currency: 'SGD', cashBalance: 0, updatedAt: fetchedAt },
    ],
    extensions: [],
    buckets: createDefaultPortfolioBuckets(fetchedAt).map((bucket) => ({ ...bucket, targetPct: 0 })),
    assignments: [{ securityKey: 'STK:AAPL', bucketId: 'bucket_growth', createdAt: fetchedAt, updatedAt: fetchedAt }],
    syncLogs: [],
  }
}

describe('formatPortfolioExport', () => {
  it('exports stored holdings, cash and targets with original currencies and separate freshness', () => {
    const output = formatPortfolioExport(fixture(), exportedAt)
    expect(output).toContain('Exported at: 2026-09-08T01:02:03.000Z')
    expect(output).toContain(`Data fetched at: ${fetchedAt}`)
    expect(output).toContain('AAPL - Apple Inc.')
    expect(output).toContain('Quantity: 10')
    expect(output).toContain('Average cost: 150')
    expect(output).toContain('Market value: 2000')
    expect(output).toContain('Unrealized profit/loss: 500')
    expect(output).toContain('Unrealized profit/loss (%): 33.33')
    expect(output).toContain('Currency: USD')
    expect(output).toContain('tiger / SGD')
    expect(output).toContain('Cash balance: 0')
    expect(output).toContain('Allocation bucket: Growth')
    expect(output).toContain('Growth: 0%')
    expect(output).toContain('no currency conversion or combined portfolio total')
  })

  it('preserves short option quantities, contract identity, multipliers and zero valuations', () => {
    const data = fixture()
    data.positions[0] = {
      ...data.positions[0],
      secType: 'OPT',
      quantity: -2,
      identifier: 'AAPL  261218C00200000',
      multiplier: 100,
      marketValue: 0,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
    }
    const output = formatPortfolioExport(data, exportedAt)
    expect(output).toContain('Instrument type: OPT')
    expect(output).toContain('Quantity: -2')
    expect(output).toContain('Instrument identifier: AAPL  261218C00200000')
    expect(output).toContain('Contract multiplier: 100')
    expect(output).toContain('Market value: 0')
    expect(output).toContain('Unrealized profit/loss: 0')
    expect(output).toContain('Allocation bucket: Unassigned')
  })

  it('marks missing and non-finite values unavailable without substituting average cost', () => {
    const data = fixture()
    data.positions[0].marketValue = undefined
    data.positions[0].unrealizedPnl = Number.NaN
    data.positions[0].unrealizedPnlPercent = undefined
    data.positions[0].quantity = 0.00000001
    data.buckets[0].targetPct = null
    const output = formatPortfolioExport(data, exportedAt)
    expect(output).toContain('Market value: Unavailable')
    expect(output).toContain('Unrealized profit/loss: Unavailable')
    expect(output).toContain('Unrealized profit/loss (%): Unavailable')
    expect(output).toContain('Quantity: 1e-8')
    expect(output).toContain('Growth: No target set')
    expect(output).not.toContain('NaN')
  })

  it.each([
    ['"estimated"', 'Estimated'],
    ['"manual"', 'Includes manual opening cost'],
    ['"incomplete"', 'Incomplete (cost basis and profit/loss may be understated or overstated)'],
    ['"ok"', 'Computed from recorded history'],
    ['estimated', 'Estimated'],
    ['{"unexpected":"sensitive-value"}', 'Not recorded'],
  ])('labels recorded cost quality %s without exporting arbitrary metadata', (quality, expected) => {
    const data = fixture()
    data.extensions.push({ positionId: data.positions[0].id, key: 'basisQuality', value: quality })
    const output = formatPortfolioExport(data, exportedAt)
    expect(output).toContain(`Cost basis quality: ${expected}`)
    expect(output).not.toContain('sensitive-value')
  })

  it('excludes private IDs, credentials, bank records and raw extension/error data', () => {
    const data = {
      ...fixture(),
      credentials: { privateKey: 'SECRET-KEY' },
      transactions: [{ accountNo: 'BANK-ACCOUNT', description: 'BANK-SPENDING' }],
    }
    Object.assign(data.positions[0], { accountNo: 'EXTRA-ACCOUNT' })
    data.extensions.push({ positionId: data.positions[0].id, key: 'rawAccount', value: 'RAW-ACCOUNT' })
    data.syncLogs.push({
      source: 'tiger',
      category: 'positions',
      status: 'failure',
      lastSyncAt: fetchedAt,
      errorMessage: 'SECRET-ERROR',
    })
    const output = formatPortfolioExport(data, exportedAt)
    for (const secret of [
      'private-position-id',
      'private-account-number',
      'SECRET-KEY',
      'BANK-ACCOUNT',
      'BANK-SPENDING',
      'EXTRA-ACCOUNT',
      'RAW-ACCOUNT',
      'SECRET-ERROR',
    ]) {
      expect(output).not.toContain(secret)
    }
    expect(output).toContain(`tiger / positions: failure at ${fetchedAt}`)
  })

  it('reports the latest category attempt and preserves cash segments without adding them together', () => {
    const data = fixture()
    data.syncLogs = [
      { source: 'tiger', category: 'positions', status: 'failure', lastSyncAt: exportedAt.toISOString() },
      { source: 'tiger', category: 'positions', status: 'success', lastSyncAt: fetchedAt },
      { source: 'tiger', category: 'account', status: 'success', lastSyncAt: fetchedAt },
    ]
    data.accounts[0].cashBalance = 100
    data.accounts.push({ ...data.accounts[0], id: 'segment-id', segType: 'SEC', cashBalance: 100 })
    const output = formatPortfolioExport(data, exportedAt)
    expect(output).toContain('tiger / positions: failure at 2026-09-08T01:02:03.000Z')
    expect(output).not.toContain('tiger / positions: success')
    expect(output).toContain('Segment: Overall / unspecified')
    expect(output).toContain('Segment: SEC')
    expect(output).toContain('Overall and segment balances may overlap')
    expect(output).not.toContain('Cash balance: 200')
  })

  it('handles an empty portfolio explicitly', () => {
    const output = formatPortfolioExport(
      { positions: [], accounts: [], extensions: [], buckets: [], assignments: [], syncLogs: [] },
      exportedAt
    )
    expect(output).toContain('No holdings stored.')
    expect(output).toContain('No investment cash balances stored.')
    expect(output).toContain('No allocation buckets stored.')
    expect(output).toContain('No sync history stored')
  })
})

describe('createPortfolioExport', () => {
  it('reads only portfolio tables in one read-only transaction and returns a dated text file', async () => {
    const data = fixture()
    const table = (rows: unknown[]) => ({ toArray: vi.fn().mockResolvedValue(rows) })
    const database = {
      brokeragePositions: table(data.positions),
      brokerageAccounts: table(data.accounts),
      brokeragePositionExtensions: { filter: vi.fn().mockReturnValue(table(data.extensions)) },
      portfolioBuckets: table(data.buckets),
      portfolioBucketAssignments: table(data.assignments),
      brokerageSyncLog: table(data.syncLogs),
      transaction: vi.fn(async (_mode, _tables, read) => read()),
    }
    const result = await createPortfolioExport(database as unknown as LokfiDatabase, exportedAt)
    expect(database.transaction).toHaveBeenCalledWith(
      'r',
      [
        database.brokeragePositions,
        database.brokerageAccounts,
        database.brokeragePositionExtensions,
        database.portfolioBuckets,
        database.portfolioBucketAssignments,
        database.brokerageSyncLog,
      ],
      expect.any(Function)
    )
    expect(result.filename).toBe('lokfi-portfolio-2026-09-08.txt')
    expect(result.text).toBe(formatPortfolioExport(data, exportedAt))
  })
})
