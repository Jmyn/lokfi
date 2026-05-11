import { describe, expect, it } from 'vitest'
import {
  BACKUP_VERSION,
  buildImportSummary,
  normalizeBackupForImport,
  validateBackupShape,
} from './backup'

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

describe('backup helpers', () => {
  it('uses backup version 4 for portfolio buckets', () => {
    expect(BACKUP_VERSION).toBe(4)
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
})
