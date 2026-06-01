import type {
  BrokerageAccount,
  BrokerageCredentials,
  BrokerageFundDetail,
  BrokeragePosition,
  BrokeragePositionExtension,
  BrokerageSyncLog,
  BrokerageTransaction,
} from '@lokfi/brokerage-core'
import type { CustomParserProfile, StatementSource } from '@lokfi/parser-core'
import Dexie, { type Table } from 'dexie'
import {
  type DbPortfolioBucket,
  type DbPortfolioBucketAssignment,
  createDefaultPortfolioBuckets,
} from '../investments/portfolioBuckets'
import { type DbCategory, defaultCategories } from './seedCategories'

export interface DbTransaction {
  id: string // UUID (same as hash)
  hash: string // dedup key
  source: StatementSource
  accountNo: string
  date: string // ISO 8601 YYYY-MM-DD
  description: string
  transactionValue: number
  balance?: number
  category?: string // set by rule engine
  manualCategory?: string // set directly by user action; overrides rule engine
  importedAt: string // ISO 8601 timestamp
}

export interface RuleCondition {
  field: 'description' | 'source' | 'accountNo' | 'transactionValue'
  operation: 'contains' | 'equals' | 'startsWith' | 'regex' | 'gt' | 'lt' | 'between'
  value: string | number | [number, number]
}

export interface DbRule {
  id: string
  name: string
  priority: number // lower = applied first
  conditions: RuleCondition[]
  category: string // category id
  createdAt: string
}

export interface DbSetting {
  key: string
  value: string
}

export type DbCustomParserProfile = CustomParserProfile

export interface FxRateRecord {
  date: string // 'YYYY-MM-DD'
  base: string
  rates: Record<string, number>
}

export interface DbBudget {
  id: string
  categoryId: string
  monthlyLimit: number
  updatedAt: string
}

export interface DbPortfolioSnapshot {
  date: string // YYYY-MM-DD, primary key
  totalValue: number
  currency: string // preferred currency used at snapshot time
}

export class LokfiDatabase extends Dexie {
  // Bank statement tables
  transactions!: Table<DbTransaction>
  rules!: Table<DbRule>
  categories!: Table<DbCategory>
  settings!: Table<DbSetting>
  customParsers!: Table<DbCustomParserProfile>
  budgets!: Table<DbBudget>

  // Brokerage tables (v5)
  brokeragePositions!: Table<BrokeragePosition>
  brokeragePositionExtensions!: Table<BrokeragePositionExtension>
  brokerageTransactions!: Table<BrokerageTransaction>
  brokerageFundDetails!: Table<BrokerageFundDetail>
  brokerageAccounts!: Table<BrokerageAccount>
  brokerageSyncLog!: Table<BrokerageSyncLog>
  brokerageCredentials!: Table<BrokerageCredentials>
  fxRates!: Table<FxRateRecord>

  // Investment portfolio bucket tables (v9)
  portfolioBuckets!: Table<DbPortfolioBucket>
  portfolioBucketAssignments!: Table<DbPortfolioBucketAssignment>

  // Portfolio performance snapshots (v10)
  portfolioSnapshots!: Table<DbPortfolioSnapshot>

  constructor() {
    super('lokfi')

    // v1 schema
    this.version(1).stores({
      transactions: 'id, hash, source, accountNo, date, category, importedAt',
      rules: 'id, priority, category',
      categories: 'id, name',
      settings: 'key',
    })

    // v2 schema (adds manualCategory index)
    this.version(2).stores({
      transactions: 'id, hash, source, accountNo, date, category, manualCategory, importedAt',
    })

    // v3 schema (adds customParsers table)
    this.version(3).stores({
      customParsers: 'id, headerFingerprint, name, createdAt',
    })

    // v4 schema (adds budgets table for category spending limits)
    this.version(4).stores({
      budgets: 'id, categoryId',
    })

    // v5 schema (adds brokerage pipeline tables)
    this.version(5).stores({
      brokeragePositions: 'id',
      brokeragePositionExtensions: '[positionId+key], positionId',
      brokerageTransactions: 'id, orderId, source, symbol, executedAt',
      brokerageAccounts: 'id, source, currency',
      brokerageSyncLog: '++id, source, category, lastSyncAt, status',
      brokerageCredentials: 'id',
    })

    // v6 schema (adds fxRates table for currency conversion)
    this.version(6).stores({
      fxRates: '[date+base]',
    })

    // v7 schema (adds brokerageFundDetails table for unified fund details)
    this.version(7).stores({
      brokerageFundDetails: 'id, source, classifiedType, symbol, businessDate',
    })

    // v8 migration: deduplicate brokerageFundDetails by content key
    // Tiger returns the same trade once per linked account; overlapping sync
    // ranges also produce duplicate records. Clean up any that snuck in.
    this.version(8).upgrade(async (trans) => {
      const allRecords: BrokerageFundDetail[] = await trans.table('brokerageFundDetails').toArray()
      const contentKey = (fd: BrokerageFundDetail) =>
        `${fd.source}|${fd.symbol ?? ''}|${fd.businessDate}|${fd.amount}|${fd.classifiedType}`

      const seen = new Map<string, string>()
      const toDelete: string[] = []

      for (const fd of allRecords) {
        const key = contentKey(fd)
        if (seen.has(key)) {
          toDelete.push(fd.id)
        } else {
          seen.set(key, fd.id)
        }
      }

      if (toDelete.length > 0) {
        await trans.table('brokerageFundDetails').bulkDelete(toDelete)
      }
    })

    // v9 schema (adds user-defined investment portfolio buckets)
    this.version(9)
      .stores({
        portfolioBuckets: 'id, sortOrder, name',
        portfolioBucketAssignments: 'securityKey, bucketId',
      })
      .upgrade(async (trans) => {
        const table = trans.table('portfolioBuckets')
        const count = await table.count()
        if (count === 0) {
          await table.bulkAdd(createDefaultPortfolioBuckets())
        }
      })

    // v10 schema (adds daily portfolio value snapshots for performance chart)
    this.version(10).stores({
      portfolioSnapshots: 'date',
    })

    // Seed default categories and portfolio buckets on initial DB creation
    this.on('populate', () => {
      this.categories.bulkAdd(defaultCategories)
      this.portfolioBuckets.bulkAdd(createDefaultPortfolioBuckets())
    })
  }
}

// Export a singleton instance for the app to use
export const db = new LokfiDatabase()
