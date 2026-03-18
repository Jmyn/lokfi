import { describe, it, expect } from 'vitest'
import { evaluateRules } from './evaluateRules'
import type { DbTransaction, DbRule } from '../db/db'
import type { StatementSource } from '@lokfi/parser-core'

describe('Rule Engine - evaluateRules', () => {
  const baseTxn: DbTransaction = {
    id: 'test-uuid',
    hash: 'test-hash',
    source: 'ocbc' as StatementSource,
    accountNo: '1234',
    date: '2026-03-18',
    description: 'Starbucks Coffee',
    transactionValue: -5.5,
    importedAt: new Date().toISOString()
  }

  it('returns null when no rules match', () => {
    const rules: DbRule[] = [
      {
        id: 'r1',
        name: 'Grocery Rule',
        priority: 10,
        category: 'cat_groceries',
        createdAt: 'now',
        conditions: [{ field: 'description', operation: 'contains', value: 'ntuc' }]
      }
    ]
    expect(evaluateRules(baseTxn, rules)).toBeNull()
  })

  describe('String Operations (case-insensitive)', () => {
    it('matches "contains"', () => {
      const rule: DbRule = {
        id: 'r1', name: 'Coffee', priority: 10, category: 'cat_food', createdAt: 'now',
        conditions: [{ field: 'description', operation: 'contains', value: 'STARBUCKS' }]
      }
      expect(evaluateRules(baseTxn, [rule])).toBe('cat_food')
    })
    
    it('matches "equals"', () => {
      const rule: DbRule = {
        id: 'r1', name: 'Coffee', priority: 10, category: 'cat_food', createdAt: 'now',
        conditions: [{ field: 'description', operation: 'equals', value: 'starbucks coffee' }]
      }
      expect(evaluateRules(baseTxn, [rule])).toBe('cat_food')
    })

    it('matches "startsWith"', () => {
      const rule: DbRule = {
        id: 'r1', name: 'Coffee', priority: 10, category: 'cat_food', createdAt: 'now',
        conditions: [{ field: 'description', operation: 'startsWith', value: 'starbucks' }]
      }
      expect(evaluateRules(baseTxn, [rule])).toBe('cat_food')
    })

    it('matches "regex"', () => {
      const rule: DbRule = {
        id: 'r1', name: 'Coffee', priority: 10, category: 'cat_food', createdAt: 'now',
        conditions: [{ field: 'description', operation: 'regex', value: 'star.*coffee' }]
      }
      expect(evaluateRules(baseTxn, [rule])).toBe('cat_food')
    })
  })

  describe('Numeric Operations', () => {
    it('matches "gt"', () => {
      const positiveTxn = { ...baseTxn, transactionValue: 100 }
      const rule: DbRule = {
        id: 'r1', name: 'Big Income', priority: 10, category: 'cat_income', createdAt: 'now',
        conditions: [{ field: 'transactionValue', operation: 'gt', value: 50 }]
      }
      expect(evaluateRules(positiveTxn, [rule])).toBe('cat_income')
    })

    it('matches "lt"', () => {
      const rule: DbRule = {
        id: 'r1', name: 'Small Spend', priority: 10, category: 'cat_shopping', createdAt: 'now',
        conditions: [{ field: 'transactionValue', operation: 'lt', value: -1 }]
      }
      expect(evaluateRules(baseTxn, [rule])).toBe('cat_shopping') // base is -5.5
    })

    it('matches "between"', () => {
      const rule: DbRule = {
        id: 'r1', name: 'Medium Spend', priority: 10, category: 'cat_shopping', createdAt: 'now',
        conditions: [{ field: 'transactionValue', operation: 'between', value: [-10, -1] }]
      }
      expect(evaluateRules(baseTxn, [rule])).toBe('cat_shopping') // base is -5.5
    })
  })

  describe('Priority Precedence & Multiple Conditions', () => {
    it('respects priority ordering (lower number wins)', () => {
      const ruleLowPriority: DbRule = {
        id: 'r1', name: 'Catch All', priority: 999, category: 'cat_other', createdAt: 'now',
        conditions: [{ field: 'description', operation: 'contains', value: 'coffee' }]
      }
      const ruleHighPriority: DbRule = {
        id: 'r2', name: 'Specific Coffee', priority: 10, category: 'cat_food', createdAt: 'now',
        conditions: [{ field: 'description', operation: 'contains', value: 'starbucks' }]
      }
      
      // Pass them in reverse order to ensure the function sorts them
      expect(evaluateRules(baseTxn, [ruleLowPriority, ruleHighPriority])).toBe('cat_food')
    })

    it('requires ALL conditions to match (AND logic)', () => {
      const rule: DbRule = {
        id: 'r1', name: 'Specific Rule', priority: 10, category: 'cat_food', createdAt: 'now',
        conditions: [
          { field: 'description', operation: 'contains', value: 'starbucks' },
          { field: 'transactionValue', operation: 'gt', value: 0 } // baseTxn is -5.5
        ]
      }
      expect(evaluateRules(baseTxn, [rule])).toBeNull()
    })
  })
})
