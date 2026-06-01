import { describe, expect, it } from 'vitest'
import { BACKUP_VERSION, buildImportSummary, normalizeBackupForImport, validateBackupShape } from './backup'

const baseV3 = {
  version: 3,
  exportedAt: '2026-05-11T00:00:00.000Z',
  transactions: [],
  rules: [],
  categories: [],
  customParsers: [],
  budgets: [],
  brokeragePositions: [],
  brokeragePositionExtensions: [],
  brokerageTransactions: [],
  brokerageFundDetails: [],
  brokerageAccounts: [],
  brokerageSyncLog: [],
  brokerageCredentials: [],
}

const baseV4 = {
  ...baseV3,
  version: 4,
  portfolioBuckets: [],
  portfolioBucketAssignments: [],
}

describe('backup helpers', () => {
  it('uses backup version 5 for portfolio snapshots', () => {
    expect(BACKUP_VERSION).toBe(5)
  })

  it('requires portfolio bucket arrays for v4 backups', () => {
    expect(validateBackupShape({ ...baseV3, version: 4 }).valid).toBe(false)
    expect(
      validateBackupShape({ ...baseV3, version: 4, portfolioBuckets: [], portfolioBucketAssignments: [] })
    ).toEqual({ valid: true })
  })

  it('normalizes older v1-v3 backups with empty bucket arrays', () => {
    const normalized = normalizeBackupForImport(baseV3)

    expect(normalized.portfolioBuckets).toEqual([])
    expect(normalized.portfolioBucketAssignments).toEqual([])
  })

  it('keeps v4 bucket arrays during normalization', () => {
    const normalized = normalizeBackupForImport({
      ...baseV3,
      version: 4,
      portfolioBuckets: [
        {
          id: 'bucket_growth',
          name: 'Growth',
          color: '#3b82f6',
          sortOrder: 0,
          isDefault: true,
          createdAt: 'now',
          updatedAt: 'now',
        },
      ],
      portfolioBucketAssignments: [
        { securityKey: 'STK:AAPL', bucketId: 'bucket_growth', createdAt: 'now', updatedAt: 'now' },
      ],
    })

    expect(normalized.portfolioBuckets).toHaveLength(1)
    expect(normalized.portfolioBucketAssignments).toHaveLength(1)
  })

  it('includes bucket counts in import summary', () => {
    const summary = buildImportSummary({
      ...normalizeBackupForImport(baseV3),
      portfolioBuckets: [
        {
          id: 'bucket_growth',
          name: 'Growth',
          color: '#3b82f6',
          sortOrder: 0,
          isDefault: true,
          createdAt: 'now',
          updatedAt: 'now',
        },
      ],
      portfolioBucketAssignments: [
        { securityKey: 'STK:AAPL', bucketId: 'bucket_growth', createdAt: 'now', updatedAt: 'now' },
      ],
    })

    expect(summary).toContain('1 portfolio bucket(s)')
    expect(summary).toContain('1 portfolio bucket assignment(s)')
  })

  it('requires portfolioSnapshots array for v5 backups', () => {
    expect(validateBackupShape({ ...baseV4, version: 5 }).valid).toBe(false)
    expect(validateBackupShape({ ...baseV4, version: 5, portfolioSnapshots: [] })).toEqual({ valid: true })
  })

  it('normalizes v4 and older backups with empty portfolioSnapshots', () => {
    const normalizedV3 = normalizeBackupForImport(baseV3)
    expect(normalizedV3.portfolioSnapshots).toEqual([])

    const normalizedV4 = normalizeBackupForImport(baseV4)
    expect(normalizedV4.portfolioSnapshots).toEqual([])
  })

  it('keeps portfolioSnapshots during v5 normalization', () => {
    const snapshot = { date: '2026-05-01', totalValue: 10000, currency: 'SGD' }
    const normalized = normalizeBackupForImport({
      ...baseV4,
      version: 5,
      portfolioSnapshots: [snapshot],
    })
    expect(normalized.portfolioSnapshots).toHaveLength(1)
    expect(normalized.portfolioSnapshots[0]).toEqual(snapshot)
  })

  it('includes snapshot count in import summary', () => {
    const summary = buildImportSummary({
      ...normalizeBackupForImport({ ...baseV4, version: 5, portfolioSnapshots: [] }),
      portfolioSnapshots: [
        { date: '2026-05-01', totalValue: 10000, currency: 'SGD' },
        { date: '2026-05-02', totalValue: 10200, currency: 'SGD' },
      ],
    })
    expect(summary).toContain('2 portfolio snapshot(s)')
  })
})
