import { createDefaultPortfolioBuckets } from '../investments/portfolioBuckets'
import type { LokfiDatabase } from './db'

export const BACKUP_VERSION = 5

export interface LokfiBackup {
  version: 1 | 2 | 3 | 4 | 5
  exportedAt?: string
  transactions: unknown[]
  rules: unknown[]
  categories: unknown[]
  customParsers: unknown[]
  budgets: unknown[]
  brokeragePositions: unknown[]
  brokeragePositionExtensions: unknown[]
  brokerageTransactions: unknown[]
  brokerageFundDetails: unknown[]
  brokerageAccounts: unknown[]
  brokerageSyncLog: unknown[]
  brokerageCredentials: unknown[]
  portfolioBuckets: unknown[]
  portfolioBucketAssignments: unknown[]
  portfolioSnapshots: unknown[]
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

export function validateBackupShape(data: unknown): { valid: true } | { valid: false; message: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, message: 'Invalid backup file: expected an object.' }
  }
  const candidate = data as Record<string, unknown>
  const version = Number(candidate.version)
  if (![1, 2, 3, 4, 5].includes(version)) {
    return { valid: false, message: 'Invalid backup file: unsupported backup version.' }
  }
  for (const key of ['transactions', 'rules', 'categories', 'customParsers', 'budgets']) {
    if (!isArray(candidate[key])) {
      return { valid: false, message: `Invalid backup file: missing ${key} array.` }
    }
  }
  if (version >= 2) {
    for (const key of [
      'brokeragePositions',
      'brokeragePositionExtensions',
      'brokerageTransactions',
      'brokerageAccounts',
      'brokerageSyncLog',
      'brokerageCredentials',
    ]) {
      if (!isArray(candidate[key])) {
        return { valid: false, message: `Invalid brokerage backup file: missing ${key} array.` }
      }
    }
  }
  if (version >= 3 && !isArray(candidate.brokerageFundDetails)) {
    return { valid: false, message: 'Invalid v3 backup file: missing brokerageFundDetails array.' }
  }
  if (version >= 4) {
    if (!isArray(candidate.portfolioBuckets) || !isArray(candidate.portfolioBucketAssignments)) {
      return { valid: false, message: 'Invalid v4 backup file: missing portfolio bucket arrays.' }
    }
  }
  if (version >= 5 && !isArray(candidate.portfolioSnapshots)) {
    return { valid: false, message: 'Invalid v5 backup file: missing portfolioSnapshots array.' }
  }
  return { valid: true }
}

export function normalizeBackupForImport(data: Record<string, unknown>): LokfiBackup {
  const version = Number(data.version) as 1 | 2 | 3 | 4 | 5
  return {
    version,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : undefined,
    transactions: data.transactions as unknown[],
    rules: data.rules as unknown[],
    categories: data.categories as unknown[],
    customParsers: data.customParsers as unknown[],
    budgets: data.budgets as unknown[],
    brokeragePositions: version >= 2 ? (data.brokeragePositions as unknown[]) : [],
    brokeragePositionExtensions: version >= 2 ? (data.brokeragePositionExtensions as unknown[]) : [],
    brokerageTransactions: version >= 2 ? (data.brokerageTransactions as unknown[]) : [],
    brokerageFundDetails: version >= 3 ? (data.brokerageFundDetails as unknown[]) : [],
    brokerageAccounts: version >= 2 ? (data.brokerageAccounts as unknown[]) : [],
    brokerageSyncLog: version >= 2 ? (data.brokerageSyncLog as unknown[]) : [],
    brokerageCredentials: version >= 2 ? (data.brokerageCredentials as unknown[]) : [],
    portfolioBuckets: version >= 4 ? (data.portfolioBuckets as unknown[]) : [],
    portfolioBucketAssignments: version >= 4 ? (data.portfolioBucketAssignments as unknown[]) : [],
    portfolioSnapshots: version >= 5 ? (data.portfolioSnapshots as unknown[]) : [],
  }
}

export function buildImportSummary(data: LokfiBackup): string {
  return (
    `This will replace all current data with the backup:\n` +
    `• ${data.transactions.length} transaction(s)\n` +
    `• ${data.rules.length} rule(s)\n` +
    `• ${data.categories.length} categor(ies)\n` +
    `• ${data.customParsers.length} parser profile(s)\n` +
    `• ${data.budgets.length} budget(s)\n` +
    `• ${data.brokeragePositions.length} brokerage position(s)\n` +
    `• ${data.brokerageTransactions.length} brokerage trade(s)\n` +
    `• ${data.brokerageFundDetails.length} fund detail(s)\n` +
    `• ${data.brokerageAccounts.length} brokerage account(s)\n` +
    `• ${data.brokerageCredentials.length} credential(s) (encrypted)\n` +
    `• ${data.portfolioBuckets.length} portfolio bucket(s)\n` +
    `• ${data.portfolioBucketAssignments.length} portfolio bucket assignment(s)\n` +
    `• ${data.portfolioSnapshots.length} portfolio snapshot(s)\n` +
    `Current data will be overwritten. Are you sure?`
  )
}

export async function buildBackupPayload(db: LokfiDatabase): Promise<LokfiBackup & { exportedAt: string }> {
  const [
    transactions,
    rules,
    categories,
    customParsers,
    budgets,
    brokeragePositions,
    brokeragePositionExtensions,
    brokerageTransactions,
    brokerageFundDetails,
    brokerageAccounts,
    brokerageSyncLog,
    brokerageCredentials,
    portfolioBuckets,
    portfolioBucketAssignments,
    portfolioSnapshots,
  ] = await Promise.all([
    db.transactions.toArray(),
    db.rules.toArray(),
    db.categories.toArray(),
    db.customParsers.toArray(),
    db.budgets.toArray(),
    db.brokeragePositions.toArray(),
    db.brokeragePositionExtensions.toArray(),
    db.brokerageTransactions.toArray(),
    db.brokerageFundDetails.toArray(),
    db.brokerageAccounts.toArray(),
    db.brokerageSyncLog.toArray(),
    db.brokerageCredentials.toArray(),
    db.portfolioBuckets.toArray(),
    db.portfolioBucketAssignments.toArray(),
    db.portfolioSnapshots.toArray(),
  ])
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    transactions,
    rules,
    categories,
    customParsers,
    budgets,
    brokeragePositions,
    brokeragePositionExtensions,
    brokerageTransactions,
    brokerageFundDetails,
    brokerageAccounts,
    brokerageSyncLog,
    brokerageCredentials,
    portfolioBuckets,
    portfolioBucketAssignments,
    portfolioSnapshots,
  }
}

export async function importBackupPayload(db: LokfiDatabase, data: LokfiBackup): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.transactions,
      db.rules,
      db.categories,
      db.customParsers,
      db.budgets,
      db.brokeragePositions,
      db.brokeragePositionExtensions,
      db.brokerageTransactions,
      db.brokerageFundDetails,
      db.brokerageAccounts,
      db.brokerageSyncLog,
      db.brokerageCredentials,
      db.portfolioBuckets,
      db.portfolioBucketAssignments,
      db.portfolioSnapshots,
    ],
    async () => {
      await Promise.all([
        db.transactions.clear(),
        db.rules.clear(),
        db.categories.clear(),
        db.customParsers.clear(),
        db.budgets.clear(),
        db.brokeragePositions.clear(),
        db.brokeragePositionExtensions.clear(),
        db.brokerageTransactions.clear(),
        db.brokerageFundDetails.clear(),
        db.brokerageAccounts.clear(),
        db.brokerageSyncLog.clear(),
        db.brokerageCredentials.clear(),
        db.portfolioBuckets.clear(),
        db.portfolioBucketAssignments.clear(),
        db.portfolioSnapshots.clear(),
      ])
      if (data.transactions.length) await db.transactions.bulkAdd(data.transactions as never[])
      if (data.rules.length) await db.rules.bulkAdd(data.rules as never[])
      if (data.categories.length) await db.categories.bulkAdd(data.categories as never[])
      if (data.customParsers.length) await db.customParsers.bulkAdd(data.customParsers as never[])
      if (data.budgets.length) await db.budgets.bulkAdd(data.budgets as never[])
      if (data.brokeragePositions.length) await db.brokeragePositions.bulkAdd(data.brokeragePositions as never[])
      if (data.brokeragePositionExtensions.length) {
        await db.brokeragePositionExtensions.bulkAdd(data.brokeragePositionExtensions as never[])
      }
      if (data.brokerageTransactions.length)
        await db.brokerageTransactions.bulkAdd(data.brokerageTransactions as never[])
      if (data.brokerageFundDetails.length) await db.brokerageFundDetails.bulkAdd(data.brokerageFundDetails as never[])
      if (data.brokerageAccounts.length) await db.brokerageAccounts.bulkAdd(data.brokerageAccounts as never[])
      if (data.brokerageSyncLog.length) await db.brokerageSyncLog.bulkAdd(data.brokerageSyncLog as never[])
      if (data.brokerageCredentials.length) await db.brokerageCredentials.bulkAdd(data.brokerageCredentials as never[])
      const buckets = data.portfolioBuckets.length ? data.portfolioBuckets : createDefaultPortfolioBuckets()
      if (buckets.length) await db.portfolioBuckets.bulkAdd(buckets as never[])
      if (data.portfolioBucketAssignments.length) {
        await db.portfolioBucketAssignments.bulkAdd(data.portfolioBucketAssignments as never[])
      }
      if (data.portfolioSnapshots.length) await db.portfolioSnapshots.bulkAdd(data.portfolioSnapshots as never[])
    }
  )
}
