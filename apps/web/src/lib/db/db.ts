import Dexie, { type Table } from 'dexie'
import type { StatementSource, CustomParserProfile } from '@lokfi/parser-core'
import { defaultCategories, type DbCategory } from './seedCategories'

export interface DbTransaction {
  id: string              // UUID (same as hash)
  hash: string            // dedup key
  source: StatementSource
  accountNo: string
  date: string            // ISO 8601 YYYY-MM-DD
  description: string
  transactionValue: number
  balance?: number
  category?: string       // set by rule engine
  manualCategory?: string // set directly by user action; overrides rule engine
  importedAt: string      // ISO 8601 timestamp
}

export interface RuleCondition {
  field: 'description' | 'source' | 'accountNo' | 'transactionValue'
  operation: 'contains' | 'equals' | 'startsWith' | 'regex' | 'gt' | 'lt' | 'between'
  value: string | number | [number, number]
}

export interface DbRule {
  id: string
  name: string
  priority: number        // lower = applied first
  conditions: RuleCondition[]
  category: string        // category id
  createdAt: string
}

export interface DbSetting {
  key: string
  value: string
}

export type DbCustomParserProfile = CustomParserProfile

export class LokfiDatabase extends Dexie {
  transactions!: Table<DbTransaction>
  rules!: Table<DbRule>
  categories!: Table<DbCategory>
  settings!: Table<DbSetting>
  customParsers!: Table<DbCustomParserProfile>

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

    // Seed default categories on initial DB creation
    this.on('populate', () => {
      this.categories.bulkAdd(defaultCategories)
    })
  }
}

// Export a singleton instance for the app to use
export const db = new LokfiDatabase()
