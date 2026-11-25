import type { Filters } from '../../pages/transactions/filterTypes'
import {
  type AskHistory,
  type AskQuery,
  type AskRuleDraft,
  type AskTurn,
  type PendingAskClarification,
  analyseOverseas,
  analysePortfolio,
  analyseSpending,
  describeScope,
  filtersForAskQuery,
  isAskReport,
  type loadAskContext,
  prepareRuleDraft,
  resolveAskQuery,
} from './askLokfiData'
import type { AskPlan } from './askLokfiPlan'

export type AskAnswer =
  | { kind: 'spending'; data: Awaited<ReturnType<typeof analyseSpending>> }
  | { kind: 'overseas'; data: Awaited<ReturnType<typeof analyseOverseas>> }
  | { kind: 'portfolio'; data: Awaited<ReturnType<typeof analysePortfolio>> }
  | { kind: 'rule'; draft: AskRuleDraft; category: string }
  | { kind: 'transactions' }

export function askEvidenceFilters(query: AskQuery, withinRows: ReadonlySet<string>, excluded = false): Filters {
  const filters = excluded
    ? { ...query.filters, excludedCategoryIds: undefined, excludeTransfers: undefined, excludeInvestments: undefined }
    : query.filters
  return filtersForAskQuery({ filters, withinRows })
}

export function recordAskTurn(history: AskHistory, turn: AskTurn): AskHistory {
  return {
    latest: turn,
    reports: isAskReport(turn.action) ? { ...history.reports, [turn.action]: turn } : history.reports,
  }
}

export async function executeAskAction(
  plan: AskPlan,
  view: { filters: Filters; onTransactions: boolean },
  history: AskHistory,
  context: Awaited<ReturnType<typeof loadAskContext>>,
  pending?: PendingAskClarification
) {
  const { action } = plan
  if (action === 'clarify') throw new Error('Choose an action before applying filters.')
  const query = resolveAskQuery(plan, view.filters, history, context, view.onTransactions)
  const filters = filtersForAskQuery(query)
  const scope = describeScope(filters, context)
  let answer: AskAnswer
  let turn: AskTurn
  let transactionView: Filters | undefined
  switch (action) {
    case 'spending': {
      const data = await analyseSpending(filters, context)
      answer = { kind: 'spending', data }
      turn = { action, query, matches: data.ids }
      break
    }
    case 'overseas': {
      const data = await analyseOverseas(filters)
      answer = { kind: 'overseas', data }
      turn = { action, query, matches: data.ids }
      if (data.ids.size || view.onTransactions) transactionView = askEvidenceFilters(query, data.ids)
      break
    }
    case 'portfolio':
      answer = { kind: 'portfolio', data: await analysePortfolio(query.filters) }
      turn = { action, query }
      scope.unshift('Whole portfolio')
      break
    case 'draft_rule': {
      const draft = await prepareRuleDraft(plan, filters, context, pending)
      answer = {
        kind: 'rule',
        draft,
        category: context.categories.find(({ value }) => value === draft.category)?.label ?? '',
      }
      turn = { action, query }
      break
    }
    case 'show_transactions':
      answer = { kind: 'transactions' }
      turn = { action, query }
      transactionView = filters
      break
  }
  return { answer, turn, scope, transactionView }
}
