import { describe, expect, it, vi } from 'vitest'
import { type Filters, defaultFilters } from '../../pages/transactions/filterTypes'
import { type UnifiedTransactionRow, fetchUnifiedRows } from '../brokerage/unifiedTransactions'
import { extractMerchant } from '../merchantDescription'
import { askEvidenceFilters, executeAskAction, recordAskTurn } from './askLokfiActions'
import {
  type AskHistory,
  analyseOverseas,
  analysePortfolio,
  analyseSpending,
  filtersForAskQuery,
  loadAskContext,
  prepareAskRequest,
  prepareRuleDraft,
  rememberAskClarification,
  resolveAskQuery,
} from './askLokfiData'
import { type AskPlan, pendingRuleDescription } from './askLokfiPlan'

vi.mock('../db/db', () => ({
  db: {
    transactions: {
      toArray: async () => [
        {
          accountNo: '9876543210987654',
          source: 'citibank',
          description: 'PAYNOW Transfer to Demo Recipient via FAST',
        },
        {
          accountNo: '5555666677778888',
          source: 'dbs',
          description: 'DEMO',
        },
        {
          accountNo: '1111122222333334',
          source: 'zz custom source with Firstname Lastname',
          description: 'DEMO',
        },
      ],
    },
    categories: {
      toArray: async () => [
        { id: 'cat_food', name: 'Food & Dining' },
        { id: 'cat_investment', name: 'Investment' },
        { id: 'cat_utilities', name: 'Bills & Utilities' },
        { id: 'cat_private', name: 'Trip with Avery Exampleperson' },
      ],
    },
    rules: { toArray: async () => [] },
    portfolioSnapshots: {
      orderBy: () => ({
        toArray: async () => [
          { date: '2026-01-01', currency: 'SGD', totalValue: 100 },
          { date: '2026-02-01', currency: 'USD', totalValue: 110 },
          { date: '2026-03-01', currency: 'SGD', totalValue: 130 },
        ],
      }),
    },
  },
}))

vi.mock('../brokerage/unifiedTransactions', () => ({
  fetchUnifiedRows: vi.fn(async () => ({
    rows: [
      { id: 'local', source: 'citibank', description: 'EXAMPLE Singapore SG', amount: -20 },
      { id: 'overseas', source: 'citibank', description: 'EXAMPLE Tokyo JP', amount: -50 },
      { id: 'false-positive', source: 'citibank', description: 'EXAMPLE DIGITAL SV', amount: -10 },
    ],
  })),
}))

const plan: AskPlan = {
  action: 'show_transactions',
  scopeBase: 'current_filters',
  report: null,
  scope: {
    dateFrom: null,
    dateTo: null,
    source: null,
    account: null,
    category: null,
    description: null,
    excludeCategories: null,
    excludeTransfers: null,
    excludeInvestments: null,
  },
  rule: null,
  clarificationKind: null,
  message: null,
}

const emptyHistory: AskHistory = { reports: {} }

function resolveFilters(
  plan: AskPlan,
  view: Filters,
  context: Awaited<ReturnType<typeof loadAskContext>>,
  history = emptyHistory
) {
  return filtersForAskQuery(resolveAskQuery(plan, view, history, context, true))
}

function bankRow(id: string, description: string, amount: number, manualCategory?: string): UnifiedTransactionRow {
  const source = 'citibank'
  const date = '2026-07-03'
  return {
    id,
    description,
    amount,
    source,
    date,
    type: 'BANK',
    currency: 'SGD',
    isBank: true,
    originalBank: {
      id,
      hash: id,
      source,
      description,
      date,
      transactionValue: amount,
      accountNo: 'demo',
      manualCategory,
      importedAt: '2026-11-24T00:00:00Z',
    },
  }
}

describe('Ask Lokfi local operations', () => {
  it('resolves known card references locally and sends no raw banking identifiers or statement text', async () => {
    const context = await loadAskContext()
    const request = prepareAskRequest(
      'Show charges on card ending in 7654 for Demo Recipient, demo@example.com, +65 9123 4567 on 2026-11-24',
      '2026-11-24',
      '/transactions',
      { ...defaultFilters, accounts: ['9876543210987654'], description: 'Private statement text' },
      emptyHistory,
      context
    )

    const payload = JSON.stringify(request)
    for (const value of [
      '9876543210987654',
      '7654',
      'Demo Recipient',
      'demo@example.com',
      '9123',
      'Private statement text',
    ]) {
      expect(payload).not.toContain(value)
    }
    expect(request.question).toContain('a1_1')
    expect(request.question).toContain('2026-11-24')
    expect(request.currentScope.accounts).toEqual(['a1_1'])
    expect(request.currentScope.excludeTransfers).toBeNull()
  })

  it('preserves unchanged scope and rejects an unavailable account alias', async () => {
    const context = await loadAskContext()
    const filters = { ...defaultFilters, dateFrom: '2026-01-01', sources: ['citibank'], description: 'Demo merchant' }
    const next = resolveFilters({ ...plan, scope: { ...plan.scope, account: 'a1_1' } }, filters, context)

    expect(next).toMatchObject({ ...filters, sourceType: 'bank', accounts: ['9876543210987654'] })
    expect(() => resolveFilters({ ...plan, scope: { ...plan.scope, account: 'other' } }, filters, context)).toThrow(
      'That account is unavailable.'
    )
  })

  it('recomputes results for a replacement month and can explicitly narrow existing rows', async () => {
    const context = await loadAskContext()
    const resultRowIds = new Set(['july-charge'])
    const july = { ...defaultFilters, dateFrom: '2026-07-01', dateTo: '2026-07-31', resultRowIds }
    const mayPlan: AskPlan = {
      ...plan,
      action: 'overseas',
      scope: { ...plan.scope, dateFrom: '2026-05-01', dateTo: '2026-05-31' },
    }
    expect(resolveFilters(mayPlan, july, context)).toMatchObject({
      dateFrom: '2026-05-01',
      dateTo: '2026-05-31',
      resultRowIds: undefined,
    })
    const narrow: AskPlan = {
      ...plan,
      scopeBase: 'current_results',
      scope: { ...plan.scope, dateTo: '2026-07-15' },
    }
    expect(resolveFilters(narrow, july, context).resultRowIds).toBe(resultRowIds)
    expect(resolveFilters(plan, july, context).resultRowIds).toBeUndefined()
  })

  it('keeps account and bank selections compatible when switching either one', async () => {
    const context = await loadAskContext()
    const citi = '9876543210987654'
    const dbs = '5555666677778888'
    const citiView = { ...defaultFilters, sources: ['citibank'], accounts: [citi], dateFrom: '2026-05-01' }
    const switchBank: AskPlan = { ...plan, scope: { ...plan.scope, source: 's2' } }
    expect(resolveFilters(switchBank, citiView, context)).toMatchObject({
      sources: ['dbs'],
      accounts: [],
      dateFrom: citiView.dateFrom,
    })
    expect(resolveFilters(switchBank, { ...citiView, accounts: [citi, dbs] }, context).accounts).toEqual([dbs])
    const switchAccount: AskPlan = { ...plan, scope: { ...plan.scope, account: 'a2_1' } }
    expect(resolveFilters(switchAccount, citiView, context)).toMatchObject({ sources: ['dbs'], accounts: [dbs] })
    expect(() =>
      resolveFilters({ ...switchBank, scope: { ...switchBank.scope, account: 'a1_1' } }, citiView, context)
    ).toThrow('The selected account belongs to a different bank.')
  })

  it('only applies dates to whole-portfolio reports and rejects explicit transaction scope', async () => {
    const context = await loadAskContext()
    const portfolioPlan: AskPlan = { ...plan, action: 'portfolio' }
    const activeView = {
      ...defaultFilters,
      dateFrom: '2026-01-01',
      accounts: ['9876543210987654'],
      sources: ['citibank'],
      categoryId: 'cat_food',
    }
    expect(resolveFilters(portfolioPlan, activeView, context)).toMatchObject({
      ...defaultFilters,
      dateFrom: '2026-01-01',
    })
    for (const unsupported of [{ account: 'a1_1' }, { source: 's1' }, { category: 'c1' }]) {
      expect(() =>
        resolveFilters({ ...portfolioPlan, scope: { ...plan.scope, ...unsupported } }, activeView, context)
      ).toThrow('Ask Lokfi can show portfolio-wide history.')
    }
  })

  it('preserves brokerage scope when a transaction request only changes dates', async () => {
    const context = await loadAskContext()
    const dividendView = { ...defaultFilters, type: 'DIVIDEND' }
    const datePlan = { ...plan, scope: { ...plan.scope, dateFrom: '2026-07-01' } }
    const request = prepareAskRequest(
      'Show these transactions from July',
      '2026-11-24',
      '/transactions',
      dividendView,
      emptyHistory,
      context
    )
    expect(request.currentScope).toMatchObject({
      sourceType: 'all',
      transactionType: 'DIVIDEND',
      brokerageScoped: true,
    })
    expect(() => resolveFilters(datePlan, dividendView, context)).toThrow(
      'Use the transaction filters for brokerage rows'
    )
    expect(() => resolveFilters({ ...datePlan, scopeBase: 'all' }, dividendView, context)).toThrow(
      'Use the transaction filters for brokerage rows'
    )
    const history = recordAskTurn(emptyHistory, { action: 'show_transactions', query: { filters: defaultFilters } })
    expect(() => resolveFilters({ ...datePlan, scopeBase: 'previous_query' }, dividendView, context, history)).toThrow(
      'Use the transaction filters for brokerage rows'
    )
    expect(() => resolveFilters(datePlan, { ...defaultFilters, sources: ['tiger'] }, context)).toThrow(
      'Use the transaction filters for brokerage rows'
    )
    expect(
      resolveFilters({ ...datePlan, scope: { ...datePlan.scope, source: 's1' } }, dividendView, context)
    ).toMatchObject({
      sources: ['citibank'],
      sourceType: 'bank',
      type: '',
      dateFrom: '2026-07-01',
    })
  })

  it('keeps custom labels and the pending rule description out of outgoing requests', async () => {
    const context = await loadAskContext()
    const first = prepareAskRequest(
      'Show Trip with Avery Exampleperson and transactions at 5 Example Lane',
      '2026-11-24',
      '/transactions',
      defaultFilters,
      emptyHistory,
      context
    )
    const firstPayload = JSON.stringify(first)
    expect(firstPayload).not.toContain('Avery Exampleperson')
    expect(firstPayload).not.toContain('Example Lane')
    expect(firstPayload).not.toContain('Firstname Lastname')
    const category = context.categories.find(({ value }) => value === 'cat_private')!
    expect(first.question).toContain(category.key)
    expect(first.categories.find(({ key }) => key === category.key)?.label).toMatch(/^Category /)

    const merchant = prepareAskRequest(
      'Show transactions matching DEMO COFFEE ROASTERS',
      '2026-11-24',
      '/transactions',
      defaultFilters,
      emptyHistory,
      context
    )
    expect(merchant.question).toContain('DEMO COFFEE ROASTERS')

    const pending = rememberAskClarification(
      {
        ...plan,
        action: 'clarify',
        clarificationKind: 'rule_category',
        rule: { name: null, category: null, source: 's1', description: 'DEMO BOOKSHOP' },
        message: 'Which category for DEMO BOOKSHOP?',
      },
      context
    )
    const next = prepareAskRequest(
      'Food & Dining',
      '2026-11-24',
      '/transactions',
      defaultFilters,
      emptyHistory,
      context,
      pending
    )
    expect(next.clarification).toEqual({
      kind: 'rule_category',
      rule: { hasDescription: true, category: null, source: 's1' },
    })
    expect(JSON.stringify(next)).not.toContain('DEMO BOOKSHOP')
    const food = context.categories.find(({ value }) => value === 'cat_food')!
    const draft = await prepareRuleDraft(
      {
        ...plan,
        action: 'draft_rule',
        rule: { name: null, category: food.key, source: null, description: pendingRuleDescription },
      },
      defaultFilters,
      context,
      pending
    )
    expect(draft.conditions).toContainEqual({ field: 'description', operation: 'contains', value: 'DEMO BOOKSHOP' })
    expect(draft.conditions).toContainEqual({ field: 'source', operation: 'equals', value: 'citibank' })
    expect(draft.category).toBe('cat_food')
  })

  it('keeps recipient requests local and sends no active description value', async () => {
    const context = await loadAskContext()
    for (const question of [
      'Find payments to Avery Exampleperson in July',
      'Show payments from: “Avery Exampleperson”',
      'Find transfers to DEMO COFFEE ROASTERS',
    ]) {
      expect(() =>
        prepareAskRequest(question, '2026-11-24', '/transactions', defaultFilters, emptyHistory, context)
      ).toThrow('Use the Description filter in Transactions for recipient names')
    }
    const filters = { ...defaultFilters, description: 'Avery Exampleperson' }
    const request = prepareAskRequest(
      'Analyse spending in the filtered rows',
      '2026-11-24',
      '/transactions',
      filters,
      emptyHistory,
      context
    )
    expect(JSON.stringify(request)).not.toContain('Avery Exampleperson')
    expect(resolveFilters(plan, filters, context).description).toBe('Avery Exampleperson')
  })

  it('preserves empty Finances selections as query criteria until explicitly changed', async () => {
    const context = await loadAskContext()
    const filters = { ...defaultFilters, noAccounts: true, categoryIds: [] }
    const request = prepareAskRequest('Analyse spending', '2026-11-24', '/finances', filters, emptyHistory, context)
    expect(request.currentScope).toMatchObject({ noAccounts: true, noCategories: true, results: null })
    expect(resolveFilters(plan, filters, context)).toMatchObject({ noAccounts: true, categoryIds: [] })
    const named = { ...plan, scope: { ...plan.scope, account: 'a1_1', category: 'c1' } }
    expect(resolveFilters(named, filters, context)).toMatchObject({ noAccounts: undefined, categoryIds: undefined })
  })

  it('requires a recognisable place as well as a country suffix for overseas matches', async () => {
    const report = await analyseOverseas(defaultFilters)
    expect([...report.ids]).toEqual(['overseas'])
    expect(report.withLocation).toBe(2)
    expect(report.countries[0]).toMatchObject({ key: 'Japan', total: 50 })
  })

  it('compares same-currency snapshots and identifies excluded snapshots', async () => {
    const report = await analysePortfolio(defaultFilters)
    expect(report).toMatchObject({ currency: 'SGD', change: { abs: 30, pct: 30 }, ignored: 1 })
  })

  it('opens the same charges from chat or the report, and reruns from the full query after a drill-down', async () => {
    const context = await loadAskContext()
    const rows = [
      bankRow('charge', 'DEMO SHOP', -45),
      bankRow('refund', 'DEMO SHOP REFUND', 15),
      bankRow('transfer', 'DEMO TRANSFER', -75, 'cat_transfer'),
    ]
    const view = { filters: { ...defaultFilters, dateFrom: '2026-07-01' }, onTransactions: true }
    vi.mocked(fetchUnifiedRows).mockResolvedValueOnce({ rows, total: rows.length })
    const spending = await executeAskAction({ ...plan, action: 'spending' }, view, emptyHistory, context)
    const history = recordAskTurn(emptyHistory, spending.turn)
    expect(spending.turn.matches).toEqual(new Set(['charge']))
    expect(spending.turn.query.withinRows).toBeUndefined()
    const evidence = askEvidenceFilters(spending.turn.query, new Set(['charge']))
    const followUp = await executeAskAction({ ...plan, scopeBase: 'previous_results' }, view, history, context)
    expect(followUp.transactionView).toEqual(evidence)

    const portfolio = await executeAskAction({ ...plan, action: 'portfolio' }, view, history, context)
    const interleaved = recordAskTurn(history, portfolio.turn)
    const namedReport = await executeAskAction(
      { ...plan, scopeBase: 'previous_results', report: 'spending' },
      view,
      interleaved,
      context
    )
    expect(namedReport.transactionView).toEqual(evidence)

    vi.mocked(fetchUnifiedRows).mockResolvedValueOnce({ rows, total: rows.length })
    const rerun = await executeAskAction(
      {
        ...plan,
        action: 'spending',
        scopeBase: 'previous_query',
        report: 'spending',
        scope: { ...plan.scope, excludeTransfers: false },
      },
      { ...view, filters: evidence },
      recordAskTurn(history, followUp.turn),
      context
    )
    expect(rerun.turn.query).toMatchObject({ withinRows: undefined, filters: { dateFrom: '2026-07-01' } })
    expect(rerun.turn.matches).toEqual(new Set(['charge', 'transfer']))
  })

  it('applies empty overseas results on Transactions and carries them into a result follow-up', async () => {
    const context = await loadAskContext()
    const julyRow = bankRow('july', 'DEMO HOTEL Tokyo JP', -40)
    const view = { filters: defaultFilters, onTransactions: true }
    vi.mocked(fetchUnifiedRows).mockResolvedValueOnce({ rows: [julyRow], total: 1 })
    const july = await executeAskAction(
      { ...plan, action: 'overseas', scope: { ...plan.scope, dateFrom: '2026-07-01', dateTo: '2026-07-31' } },
      view,
      emptyHistory,
      context
    )
    expect(july.transactionView?.resultRowIds).toEqual(new Set(['july']))
    const history = recordAskTurn(emptyHistory, july.turn)
    const aprilPlan: AskPlan = {
      ...plan,
      action: 'overseas',
      scopeBase: 'previous_query',
      report: 'overseas',
      scope: { ...plan.scope, dateFrom: '2026-04-01', dateTo: '2026-04-30' },
    }
    vi.mocked(fetchUnifiedRows).mockResolvedValueOnce({ rows: [], total: 0 })
    const april = await executeAskAction(aprilPlan, { ...view, filters: july.transactionView! }, history, context)
    expect(fetchUnifiedRows).toHaveBeenLastCalledWith(
      expect.objectContaining({ dateFrom: '2026-04-01', dateTo: '2026-04-30', resultRowIds: undefined })
    )
    expect(april.transactionView?.resultRowIds).toEqual(new Set())
    const aprilHistory = recordAskTurn(history, april.turn)
    const request = prepareAskRequest('Show those', '2026-11-24', '/transactions', view.filters, aprilHistory, context)
    expect(request.previous?.resultCount).toBe(0)
    const followUp = await executeAskAction({ ...plan, scopeBase: 'previous_results' }, view, aprilHistory, context)
    expect(followUp.transactionView).toEqual(april.transactionView)

    vi.mocked(fetchUnifiedRows).mockResolvedValueOnce({ rows: [], total: 0 })
    const offPage = await executeAskAction(aprilPlan, { ...view, onTransactions: false }, history, context)
    expect(offPage.transactionView).toBeUndefined()
  })

  it('reuses the period, excludes investments and card settlements, and keeps ordinary bills', async () => {
    const context = await loadAskContext()
    const baseline = { ...defaultFilters, dateFrom: '2025-11-24', dateTo: '2026-11-24' }
    const filters = resolveFilters(
      {
        ...plan,
        action: 'spending',
        scope: { ...plan.scope, excludeTransfers: true, excludeInvestments: true },
      },
      baseline,
      context
    )
    const rows = [
      bankRow('funding', 'COLLECTION TRANSFER SYNTHETIC REF TIGER BROKERS', -1000),
      bankRow('investment', 'OTHER MOVEMENT', -400, 'cat_investment'),
      bankRow('settlement', 'CREDIT CARD BILL SETTLEMENT', -300),
      bankRow('manual-transfer', 'DEMO PAYMENT', -200, 'cat_transfer'),
      bankRow('electric', 'UTILITY BILL PAYMENT', -70, 'cat_utilities'),
      bankRow('tax', 'TAX PAYMENT', -50),
      bankRow('merchant', 'PAYMENT MASTERCARD DEMO CAFE', -15),
      bankRow('fee', 'TRANSFER FEE TIGER BROKERS', -25),
      bankRow('manual-expense', 'CREDIT CARD PAYMENT', -10, 'cat_food'),
    ]
    vi.mocked(fetchUnifiedRows).mockResolvedValueOnce({ rows, total: rows.length })

    const report = await analyseSpending(filters, context)
    expect(filters).toMatchObject({ dateFrom: baseline.dateFrom, dateTo: baseline.dateTo, excludeInvestments: true })
    expect(report.total).toBe(170)
    expect([...report.ids]).toEqual(['electric', 'tax', 'merchant', 'fee', 'manual-expense'])
    expect(report.exclusions).toEqual([
      {
        reason: 'investment',
        label: 'Investments and brokerage funding',
        count: 2,
        total: 1400,
        ids: new Set(['funding', 'investment']),
      },
      {
        reason: 'transfer',
        label: 'Transfers and card repayments',
        count: 2,
        total: 500,
        ids: new Set(['settlement', 'manual-transfer']),
      },
    ])

    vi.mocked(fetchUnifiedRows).mockResolvedValueOnce({ rows, total: rows.length })
    const includeTransfers = await analyseSpending({ ...filters, excludeTransfers: false }, context)
    expect(includeTransfers.total).toBe(670)
    expect(includeTransfers.exclusions.map(({ reason }) => reason)).toEqual(['investment'])
  })

  it('groups varied Grab booking references while preserving stated services', () => {
    expect(extractMerchant('Grab* A-ABCD123456AV Singapore SG')).toBe('Grab')
    expect(extractMerchant('Grab* A-TEST098765AV Singapore SG')).toBe('Grab')
    expect(extractMerchant('Grab* FOOD A-TEST098765AV Singapore SG')).toBe('GrabFood')
    expect(extractMerchant('Grab* RIDES A-TEST098765AV Singapore SG')).toBe('Grab Rides')
  })
})
