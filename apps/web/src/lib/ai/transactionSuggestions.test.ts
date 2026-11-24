import { describe, expect, it, vi } from 'vitest'
import { defaultFilters } from '../../pages/transactions/filterTypes'
import { prepareAiRun } from './transactionSuggestions'

vi.mock('../brokerage/unifiedTransactions', () => ({
  fetchUnifiedRows: async () => ({
    rows: ['123/456/789', '123.456.789', '123–456 789', '123456789'].map((formatted, index) => ({
      originalBank: {
        id: `transaction-${index}`,
        accountNo: '123-456-789',
        description: `PAYMENT ${formatted} GRAB RIDE`,
        source: 'ocbc',
        transactionValue: 10,
      },
    })),
  }),
}))

vi.mock('../db/db', () => ({
  db: {
    transaction: async (_mode: string, _tables: unknown, query: () => Promise<unknown>) => query(),
    transactions: { orderBy: () => ({ uniqueKeys: async () => ['123-456-789'] }) },
    categories: {
      toArray: async () => [
        { id: 'transfer', name: 'Transfers', isIncome: false },
        { id: 'transport', name: 'Transport', isIncome: false },
      ],
    },
    rules: {
      orderBy: () => ({
        toArray: async () => [
          {
            category: 'transfer',
            conditions: [{ field: 'description', operation: 'regex', value: String.raw`123\s*456\s*789` }],
          },
          { category: 'transfer', conditions: [{ field: 'accountNo', operation: 'equals', value: '123-456-789' }] },
          { category: 'transfer', conditions: [{ field: 'description', operation: 'contains', value: '123/456/789' }] },
          { category: 'transport', conditions: [{ field: 'description', operation: 'contains', value: 'GRAB RIDE' }] },
        ],
      }),
    },
  },
}))

describe('prepareAiRun', () => {
  it('masks known accounts across statement formats and passes private rule matches as categories only', async () => {
    const { rows, context } = await prepareAiRun(defaultFilters)

    expect(rows.map(({ input }) => input.description)).toEqual(Array(4).fill('PAYMENT [account] GRAB RIDE'))
    expect(rows.map(({ input }) => input.matchedRuleCategoryId)).toEqual(Array(4).fill('transfer'))
    expect(context.rules).toEqual([
      { categoryId: 'transport', conditions: [{ field: 'description', operation: 'contains', value: 'GRAB RIDE' }] },
    ])
  })
})
