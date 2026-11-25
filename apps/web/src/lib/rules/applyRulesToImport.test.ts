import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbRule, DbTransaction } from '../db/db'
import { applyRulesToImport } from './applyRulesToImport'

const { bulkGet, bulkUpdate, toArray } = vi.hoisted(() => ({
  bulkGet: vi.fn<(ids: string[]) => Promise<(DbTransaction | undefined)[]>>(),
  bulkUpdate: vi.fn(),
  toArray: vi.fn<() => Promise<DbRule[]>>(),
}))

vi.mock('../db/db', () => ({
  db: {
    rules: { orderBy: () => ({ toArray }) },
    transactions: { bulkGet, bulkUpdate },
    transaction: (_mode: unknown, _rules: unknown, _transactions: unknown, run: () => Promise<void>) => run(),
  },
}))

function credit(id: string, fields: Partial<DbTransaction> = {}): DbTransaction {
  return {
    id,
    hash: id,
    source: 'ocbc',
    accountNo: 'test',
    date: '2026-10-01',
    description: 'PAYMENT BY INTERNET',
    transactionValue: 100,
    importedAt: '2026-10-02T00:00:00.000Z',
    ...fields,
  }
}

describe('applyRulesToImport', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    toArray.mockResolvedValue([])
  })

  it('clears legacy Income on unmatched credits and leaves new unmatched credits uncategorized', async () => {
    bulkGet.mockResolvedValue([
      credit('new'),
      credit('legacy', { category: 'cat_income' }),
      credit('transfer', { category: 'cat_transfer' }),
    ])

    await applyRulesToImport(['new', 'legacy', 'transfer'])

    expect(bulkUpdate).toHaveBeenCalledTimes(1)
    expect(bulkUpdate.mock.lastCall?.[0]).toStrictEqual([{ key: 'legacy', changes: { category: undefined } }])
  })

  it('keeps manual and rule-assigned Income and still applies matching rules to new credits', async () => {
    toArray.mockResolvedValue([
      {
        id: 'salary',
        name: 'Salary',
        priority: 1,
        category: 'cat_income',
        createdAt: '2026-10-02T00:00:00.000Z',
        conditions: [{ field: 'description', operation: 'equals', value: 'SALARY' }],
      },
    ])
    bulkGet.mockResolvedValue([
      credit('manual', { category: 'cat_income', manualCategory: 'cat_income' }),
      credit('existing-salary', { description: 'SALARY', category: 'cat_income' }),
      credit('new-salary', { description: 'SALARY' }),
    ])

    await applyRulesToImport(['manual', 'existing-salary', 'new-salary'])

    expect(bulkUpdate).toHaveBeenCalledTimes(1)
    expect(bulkUpdate.mock.lastCall?.[0]).toStrictEqual([{ key: 'new-salary', changes: { category: 'cat_income' } }])
  })
})
