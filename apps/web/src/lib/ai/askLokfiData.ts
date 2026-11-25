import { type Filters, defaultFilters } from '../../pages/transactions/filterTypes'
import {
  type BankSpendingExclusion,
  bankSpendingExclusionLabels,
  getBankSpendingExclusion,
} from '../bankSpendingExclusions'
import { type UnifiedTransactionRow, fetchUnifiedRows } from '../brokerage/unifiedTransactions'
import { type DbRule, db } from '../db/db'
import { defaultCategories } from '../db/seedCategories'
import { computeReturn } from '../investments/portfolioPerformance'
import { extractMerchant } from '../merchantDescription'
import {
  type AskAction,
  type AskClarificationKind,
  type AskLokfiRequest,
  type AskPlan,
  type AskReport,
  pendingRuleDescription,
} from './askLokfiPlan'
import { accountMask, hasRecipientRequest, maskPersonalText } from './privacy'

const sourceLabels: Record<string, string> = {
  citi: 'Citibank',
  citibank: 'Citibank',
  ocbc: 'OCBC',
  dbs: 'DBS',
  posb: 'POSB',
  uob: 'UOB',
  cdc: 'Crypto.com',
  hsbc: 'HSBC',
  sc: 'Standard Chartered',
}

const uncategorised = '__uncategorised__'
type Choice = { key: string; label: string; value: string; publicLabel?: string }
type AccountChoice = Choice & { source: string }
type AskFilters = Omit<Filters, 'resultRowIds'>
export type AskQuery = { filters: AskFilters; withinRows?: ReadonlySet<string> }
type TransactionReport = 'spending' | 'overseas'
export type AskTurn = { query: AskQuery } & (
  | { action: TransactionReport; matches: ReadonlySet<string> }
  | { action: Exclude<AskAction, TransactionReport>; matches?: undefined }
)
export type AskHistory = { latest?: AskTurn; reports: Partial<Record<AskReport, AskTurn>> }

export function isAskReport(action: AskPlan['action']): action is AskReport {
  return action === 'spending' || action === 'overseas' || action === 'portfolio'
}

export function filtersForAskQuery({ filters, withinRows }: AskQuery): Filters {
  return { ...filters, resultRowIds: withinRows }
}
export type AskRuleDraft = Pick<DbRule, 'name' | 'category' | 'conditions' | 'priority'>
export type PendingAskClarification = {
  kind: AskClarificationKind
  rule?: { description: string | null; category: string | null; source: string | null }
}

const publicCategoryNames = new Map(
  [...defaultCategories.map(({ name }) => name), 'Investment', 'Investments', 'Travel', 'Brokerage Funding'].map(
    (name) => [name.toLowerCase(), name]
  )
)
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export async function loadAskContext() {
  const [transactions, categories] = await Promise.all([db.transactions.toArray(), db.categories.toArray()])
  const accountsBySource = new Map<string, string[]>()
  for (const { accountNo, source } of transactions) {
    const accounts = accountsBySource.get(source) ?? []
    if (!accounts.includes(accountNo)) accounts.push(accountNo)
    accountsBySource.set(source, accounts)
  }
  const maskAccount = accountMask([...accountsBySource.values()].flat())
  // Keep likely personal recipient names local when they reappear in a question.
  const payees = new Set(
    transactions.flatMap(({ description }) => {
      const recipient = description.match(
        /\b(?:PAYNOW|PAYLAH|FAST TRANSFER)\b.*?\b(?:to|from)\s+([\p{L} -]+?)(?=\s+via\b|[,;]|$)/iu
      )?.[1]
      return recipient?.trim() ? [recipient.trim()] : []
    })
  )
  const sanitize = (value: string) => {
    let text = maskPersonalText(maskAccount(value))
    for (const payee of payees) {
      text = text.replace(new RegExp(`(?<![\\p{L}])${escapeRegExp(payee)}(?![\\p{L}])`, 'giu'), '[recipient]')
    }
    return text
  }
  const sources: Choice[] = [...accountsBySource.keys()].sort().map((value, index) => ({
    key: `s${index + 1}`,
    label: sourceLabels[value.toLowerCase()] ?? value,
    publicLabel: sourceLabels[value.toLowerCase()] ?? `Statement source ${index + 1}`,
    value,
  }))
  const accounts: AccountChoice[] = sources.flatMap(({ value, label, publicLabel }, sourceIndex) =>
    [...(accountsBySource.get(value) ?? [])].sort().map((accountNo, index) => ({
      key: `a${sourceIndex + 1}_${index + 1}`,
      label: `${label} account ${index + 1}`,
      publicLabel: `${publicLabel} account ${index + 1}`,
      value: accountNo,
      source: value,
    }))
  )
  const categoryChoices: Choice[] = categories
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ id, name }, index) => ({
      key: `c${index + 1}`,
      label: name,
      publicLabel: publicCategoryNames.get(name.trim().toLowerCase()) ?? `Category ${index + 1}`,
      value: id,
    }))
  categoryChoices.push({ key: 'uncategorised', label: 'Uncategorised', value: uncategorised })
  const categoryNames = new Map(categories.map(({ id, name }) => [id, name]))
  return { accounts, sources, categories: categoryChoices, categoryNames, sanitize }
}

type AskContext = Awaited<ReturnType<typeof loadAskContext>>

function hasBrokerageScope(filters: Filters, context: AskContext): boolean {
  return (
    filters.sourceType === 'brokerage' ||
    !!filters.type ||
    filters.sources.some((source) => !context.sources.some(({ value }) => value === source))
  )
}

function categoryIds(filters: Filters) {
  return filters.categoryIds?.length ? filters.categoryIds : filters.categoryId ? [filters.categoryId] : []
}

function accountsInScope(filters: Filters, context: AskContext) {
  return filters.sources.length
    ? context.accounts.filter(({ source }) => filters.sources.includes(source))
    : context.accounts
}

export function describeScope(filters: Filters, context: AskContext): string[] {
  const names = (choices: Choice[], values: string[]) => [
    ...new Set(choices.filter(({ value }) => values.includes(value)).map(({ label }) => label)),
  ]
  return [
    filters.dateFrom || filters.dateTo ? `${filters.dateFrom || 'Earliest'} to ${filters.dateTo || 'Latest'}` : '',
    ...names(context.sources, filters.sources),
    ...names(accountsInScope(filters, context), filters.accounts),
    filters.noAccounts ? 'No accounts selected' : '',
    ...names(context.categories, categoryIds(filters)),
    filters.categoryIds?.length === 0 ? 'No categories selected' : '',
    ...names(context.categories, filters.excludedCategoryIds ?? []).map((label) => `Exclude ${label}`),
    filters.excludeTransfers ? 'Exclude transfers and card repayments' : '',
    filters.excludeTransfers === false ? 'Include transfers and card repayments' : '',
    filters.excludeInvestments ? 'Exclude investments and brokerage funding' : '',
    filters.description ? `Description includes “${context.sanitize(filters.description)}”` : '',
    filters.resultRowIds ? `Within ${filters.resultRowIds.size} prior results` : '',
  ].filter(Boolean)
}

export function prepareAskRequest(
  question: string,
  today: string,
  page: string,
  filters: Filters,
  history: AskHistory,
  context: AskContext,
  pending?: PendingAskClarification
): AskLokfiRequest {
  if (hasRecipientRequest(question)) {
    throw new Error('Use the Description filter in Transactions for recipient names, then ask about the filtered rows.')
  }
  const publicChoices = (choices: Choice[]) =>
    choices.map(({ key, label, publicLabel }) => ({ key, label: publicLabel ?? label }))
  const keys = (choices: Choice[], values: string[]) =>
    choices.filter(({ value }) => values.includes(value)).map(({ key }) => key)
  const scope = (filters: Filters) => ({
    sourceType: filters.sourceType,
    transactionType: filters.type,
    brokerageScoped: hasBrokerageScope(filters, context),
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    sources: keys(context.sources, filters.sources),
    accounts: keys(accountsInScope(filters, context), filters.accounts),
    noAccounts: !!filters.noAccounts,
    categories: keys(context.categories, categoryIds(filters)),
    noCategories: filters.categoryIds?.length === 0,
    excludedCategories: keys(context.categories, filters.excludedCategoryIds ?? []),
    excludeTransfers: filters.excludeTransfers ?? null,
    excludeInvestments: !!filters.excludeInvestments,
    description: filters.description ? 'A local description filter is active. Use null to keep it.' : '',
    results: filters.resultRowIds?.size ?? null,
  })
  const publicTurn = ({ action, query, matches }: AskTurn) => ({
    intent: action,
    query: scope(filtersForAskQuery(query)),
    resultCount: matches?.size ?? null,
  })
  // Resolve account references to local aliases before applying the general mask.
  let safeQuestion = question
  for (const { value, key } of context.accounts) {
    safeQuestion = accountMask([value], key)(safeQuestion)
    const lastFour = value.replace(/\D/g, '').slice(-4)
    if (
      lastFour.length === 4 &&
      context.accounts.filter((item) => item.value.replace(/\D/g, '').endsWith(lastFour)).length === 1
    ) {
      safeQuestion = safeQuestion.replace(
        new RegExp(
          `(?:\\b(?:card|account|ending(?: in)?|citi(?:bank)?)\\s*(?:[*•]+\\s*)?|[*•]{2,}\\s*)${lastFour}\\b`,
          'gi'
        ),
        key
      )
    }
  }
  const privateLabels = [...context.sources, ...context.categories]
    .filter(
      ({ label, publicLabel }) =>
        label.length > 0 && publicLabel !== undefined && publicLabel.toLowerCase() !== label.toLowerCase()
    )
    .sort((a, b) => b.label.length - a.label.length)
  if (privateLabels.length) {
    const aliases = new Map(privateLabels.map(({ key, label }) => [label.toLowerCase(), key]))
    const literals = privateLabels.map(({ label }) => escapeRegExp(label)).join('|')
    safeQuestion = safeQuestion.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])(?:${literals})(?![\\p{L}\\p{N}])`, 'giu'),
      (label) => aliases.get(label.toLowerCase()) ?? '[private label]'
    )
  }
  return {
    question: context.sanitize(safeQuestion),
    today,
    page,
    sources: publicChoices(context.sources),
    accounts: publicChoices(context.accounts),
    categories: publicChoices(context.categories),
    currentScope: scope(filters),
    previous: history.latest ? publicTurn(history.latest) : null,
    reports: Object.fromEntries(Object.entries(history.reports).map(([action, turn]) => [action, publicTurn(turn)])),
    clarification: pending && {
      kind: pending.kind,
      rule: pending.rule && {
        hasDescription: !!pending.rule.description,
        category: context.categories.find(({ value }) => pending.rule?.category === value)?.key ?? null,
        source: context.sources.find(({ value }) => pending.rule?.source === value)?.key ?? null,
      },
    },
  }
}

export function rememberAskClarification(
  plan: AskPlan,
  context: AskContext,
  previous?: PendingAskClarification
): PendingAskClarification {
  const kind = plan.clarificationKind ?? 'other'
  if (kind !== 'rule_category' && kind !== 'rule_description') return { kind }
  const description = plan.rule?.description
  return {
    kind,
    rule: {
      description:
        description && description !== pendingRuleDescription ? description : (previous?.rule?.description ?? null),
      category:
        context.categories.find(({ key }) => key === plan.rule?.category)?.value ?? previous?.rule?.category ?? null,
      source: context.sources.find(({ key }) => key === plan.rule?.source)?.value ?? previous?.rule?.source ?? null,
    },
  }
}

function lookup<T extends Choice>(choices: T[], key: string, type: string): T {
  const choice = choices.find((item) => item.key === key)
  if (!choice) throw new Error(`That ${type} is unavailable. Try naming it again.`)
  return choice
}

function dateFilter(value: string | null, fallback: string) {
  if (value === null) return fallback
  if (value === '') return ''
  const parsed = new Date(value)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error('Ask Lokfi received an invalid date. Try specifying the dates again.')
  }
  return value
}

function applyAskFilters(
  plan: AskPlan,
  current: AskFilters,
  context: AskContext,
  transactionView?: Filters
): AskFilters {
  const { scope } = plan
  if (plan.action === 'portfolio') {
    if (
      scope.source ||
      scope.account ||
      scope.category ||
      scope.description?.trim() ||
      scope.excludeCategories?.length ||
      scope.excludeTransfers ||
      scope.excludeInvestments
    ) {
      throw new Error(
        'Ask Lokfi can show portfolio-wide history. Account, broker and holding breakdowns are unavailable.'
      )
    }
  } else if (
    !scope.source &&
    !scope.account &&
    (hasBrokerageScope(current, context) ||
      (transactionView &&
        (plan.action === 'show_transactions' || plan.action === 'overseas') &&
        hasBrokerageScope(transactionView, context)))
  ) {
    throw new Error(
      'Ask Lokfi can filter bank statements. Use the transaction filters for brokerage rows, or name a bank to switch to bank statements.'
    )
  }

  const dateFrom = dateFilter(scope.dateFrom, current.dateFrom)
  const dateTo = dateFilter(scope.dateTo, current.dateTo)
  if (dateFrom && dateTo && dateFrom > dateTo) throw new Error('Choose an end date on or after the start date.')
  if (plan.action === 'portfolio') return { ...defaultFilters, dateFrom, dateTo }

  const source = scope.source ? lookup(context.sources, scope.source, 'bank').value : undefined
  const account = scope.account ? lookup(context.accounts, scope.account, 'account') : undefined
  if (source && account && source !== account.source) {
    throw new Error('The selected account belongs to a different bank. Choose a bank or an account to continue.')
  }
  const selectedSource = source ?? account?.source
  const sources = selectedSource ? [selectedSource] : scope.source === null ? current.sources : []
  const accounts = account
    ? [account.value]
    : scope.account === null
      ? current.accounts.filter(
          (value) => !source || context.accounts.some((choice) => choice.source === source && choice.value === value)
        )
      : []
  return {
    ...current,
    dateFrom,
    dateTo,
    sources,
    accounts,
    noAccounts: selectedSource || scope.account !== null ? undefined : current.noAccounts,
    categoryId:
      scope.category === null
        ? current.categoryId
        : scope.category
          ? lookup(context.categories, scope.category, 'category').value
          : '',
    categoryIds: scope.category === null ? current.categoryIds : undefined,
    description: scope.description === null ? current.description : scope.description.trim(),
    excludedCategoryIds:
      scope.excludeCategories === null
        ? current.excludedCategoryIds
        : [...new Set(scope.excludeCategories.map((key) => lookup(context.categories, key, 'category').value))],
    excludeTransfers:
      scope.excludeTransfers ?? current.excludeTransfers ?? (plan.action === 'spending' ? true : undefined),
    excludeInvestments: scope.excludeInvestments ?? current.excludeInvestments,
    sourceType: 'bank',
    type: '',
  }
}

export function resolveAskQuery(
  plan: AskPlan,
  view: Filters,
  history: AskHistory,
  context: AskContext,
  onTransactions: boolean
): AskQuery {
  const { resultRowIds, ...filters } = view
  let base: AskQuery
  switch (plan.scopeBase) {
    case 'current_filters':
      base = { filters }
      break
    case 'current_results':
      base = { filters, withinRows: resultRowIds }
      break
    case 'all':
      base = { filters: defaultFilters }
      break
    case 'previous_query':
    case 'previous_results': {
      const previous = plan.report ? history.reports[plan.report] : history.latest
      if (
        !previous ||
        (plan.scopeBase === 'previous_results' && (previous.action === 'portfolio' || previous.action === 'draft_rule'))
      ) {
        throw new Error(
          'That earlier search or report is unavailable. Open a report’s transactions or start a new search.'
        )
      }
      base = {
        filters: previous.query.filters,
        withinRows: plan.scopeBase === 'previous_results' ? (previous.matches ?? previous.query.withinRows) : undefined,
      }
      break
    }
  }
  return {
    filters: applyAskFilters(plan, base.filters, context, onTransactions ? view : undefined),
    withinRows: plan.action === 'portfolio' || plan.action === 'draft_rule' ? undefined : base.withinRows,
  }
}

export async function prepareRuleDraft(
  plan: AskPlan,
  filters: Filters,
  context: AskContext,
  pending?: PendingAskClarification
): Promise<AskRuleDraft> {
  const usesPendingDescription = plan.rule?.description === pendingRuleDescription
  const description = (
    usesPendingDescription ? (pending?.rule?.description ?? '') : (plan.rule?.description ?? filters.description ?? '')
  ).trim()
  if (description.length < 3 || context.sanitize(description) !== description || /^\[.+\]$/.test(description)) {
    throw new Error('Provide a short merchant name or statement description to match.')
  }
  const category = plan.rule?.category
    ? lookup(context.categories, plan.rule.category, 'category').value
    : filters.categoryId
  if (!category || category === uncategorised) throw new Error('Choose an existing category for the new rule.')
  const source = plan.rule?.source
    ? lookup(context.sources, plan.rule.source, 'bank').value
    : ((usesPendingDescription ? pending?.rule?.source : undefined) ??
      (filters.sources.length === 1 ? filters.sources[0] : undefined))
  const conditions: DbRule['conditions'] = [{ field: 'description', operation: 'contains', value: description }]
  if (source) conditions.push({ field: 'source', operation: 'equals', value: source })

  const existing = await db.rules.toArray()
  const normalise = (conditions: DbRule['conditions']) =>
    conditions
      .map(({ field, operation, value }) => JSON.stringify([field, operation, String(value).trim().toLowerCase()]))
      .sort()
      .join(':')
  const duplicate = existing.find(
    (rule) => rule.category === category && normalise(rule.conditions ?? []) === normalise(conditions)
  )
  if (duplicate)
    throw new Error('A rule already exists with these conditions and category. You can review it on the Rules page.')
  return {
    name: usesPendingDescription ? description : plan.rule?.name?.trim() || description,
    category,
    conditions,
    priority: 100,
  }
}

function groupSpend(rows: UnifiedTransactionRow[], key: (row: UnifiedTransactionRow) => string) {
  const groups = new Map<string, { key: string; cents: number; ids: Set<string> }>()
  for (const row of rows) {
    const name = key(row)
    const group = groups.get(name) ?? { key: name, cents: 0, ids: new Set<string>() }
    group.cents += Math.round(Math.abs(row.amount) * 100)
    group.ids.add(row.id)
    groups.set(name, group)
  }
  return [...groups.values()].map(({ cents, ...group }) => ({ ...group, total: cents / 100 }))
}

export async function analyseSpending(filters: Filters, context: AskContext) {
  const { rows } = await fetchUnifiedRows({
    ...filters,
    excludeTransfers: false,
    excludeInvestments: false,
    excludedCategoryIds: undefined,
  })
  const categoryLabels = new Map(context.categories.map(({ value, label }) => [value, label]))
  const category = (row: UnifiedTransactionRow) =>
    row.originalBank?.manualCategory ?? row.originalBank?.category ?? uncategorised
  const expenses: UnifiedTransactionRow[] = []
  const excluded = new Map<BankSpendingExclusion, { ids: Set<string>; cents: number }>()
  const spendingFilters = { ...filters, excludeTransfers: filters.excludeTransfers ?? true }
  for (const row of rows) {
    if (!row.originalBank || row.amount >= 0) continue
    const reason = getBankSpendingExclusion(row.originalBank, context.categoryNames.get(category(row)), spendingFilters)
    if (!reason) {
      expenses.push(row)
      continue
    }
    const group = excluded.get(reason) ?? { ids: new Set<string>(), cents: 0 }
    group.ids.add(row.id)
    group.cents += Math.round(Math.abs(row.amount) * 100)
    excluded.set(reason, group)
  }
  const [overall] = groupSpend(expenses, () => 'all')
  const merchants = groupSpend(expenses, (row) => extractMerchant(row.description).toUpperCase()).sort(
    (a, b) => b.total - a.total
  )
  const monthById = new Map(expenses.map(({ id, date }) => [id, date.slice(0, 7)]))
  return {
    total: overall?.total ?? 0,
    ids: overall?.ids ?? new Set<string>(),
    exclusions: [...excluded.entries()].map(([reason, { ids, cents }]) => ({
      reason,
      label: bankSpendingExclusionLabels[reason],
      count: ids.size,
      ids,
      total: cents / 100,
    })),
    matchedCount: rows.length,
    months: groupSpend(expenses, ({ date }) => date.slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key)),
    merchants,
    recurring: merchants.flatMap((merchant) => {
      const months = new Set([...merchant.ids].map((id) => monthById.get(id))).size
      return months >= 3 ? [{ ...merchant, months }] : []
    }),
    categories: groupSpend(expenses, category)
      .sort((a, b) => b.total - a.total)
      .map((group) => ({
        ...group,
        label: categoryLabels.get(group.key) ?? 'Unknown category',
      })),
  }
}

const regions = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' })
const locationSource = /^(?:citi|citibank)$/i
const cityNames: Record<string, string[]> = {
  AU: ['Sydney', 'Melbourne', 'Perth', 'Brisbane', 'Adelaide'],
  CN: ['Shanghai', 'Beijing', 'Shenzhen', 'Guangzhou'],
  GB: ['London', 'Edinburgh', 'Manchester', 'Birmingham', 'Heathrow'],
  HK: ['Kowloon', 'Central'],
  ID: ['Jakarta', 'Bali', 'Denpasar', 'Batam', 'Bandung', 'Surabaya'],
  JP: ['Tokyo', 'Osaka', 'Kyoto', 'Fukuoka', 'Sapporo', 'Nagoya'],
  KR: ['Seoul', 'Incheon', 'Busan', 'Jeju', 'Korea'],
  MY: [
    'Kuala Lumpur',
    'Johor Bahru',
    'Johor',
    'Penang',
    'George Town',
    'Kuching',
    'Petaling Jaya',
    'Ipoh',
    'Shah Alam',
    'Kota Kinabalu',
  ],
  NZ: ['Auckland', 'Wellington', 'Christchurch'],
  TH: ['Bangkok', 'Phuket', 'Chiang Mai', 'Pattaya', 'Samui'],
  TW: ['Taipei', 'Kaohsiung', 'Taichung'],
  US: ['USA', 'New York', 'Los Angeles', 'San Francisco', 'Seattle', 'Chicago', 'Boston', 'Las Vegas', 'Miami'],
  VN: ['Hanoi', 'Ho Chi Minh', 'Da Nang'],
}

function merchantRegion(description: string): { code: string; region: string } | null {
  const match = description.trim().match(/^(.+)\s([A-Z]{2})$/u)
  if (!match) return null
  const [, prefix, code] = match
  const region = regions.of(code)
  if (!region || ['EU', 'UN', 'ZZ'].includes(code)) return null
  const normalized = ` ${prefix.trim().toLowerCase()}`
  const place = [region, ...(cityNames[code] ?? [])].some((name) => normalized.endsWith(` ${name.toLowerCase()}`))
  return place ? { code, region } : null
}

export async function analyseOverseas(filters: Filters) {
  const { rows } = await fetchUnifiedRows(filters)
  const merchantCountries = new Map<string, string>()
  let withLocation = 0
  for (const { id, source, description } of rows) {
    if (!locationSource.test(source)) continue
    const location = merchantRegion(description)
    if (!location) continue
    withLocation++
    if (location.code !== 'SG') merchantCountries.set(id, location.region)
  }
  const found = rows.filter(({ id }) => merchantCountries.has(id))
  return {
    ids: new Set(found.map(({ id }) => id)),
    reviewed: rows.length,
    withLocation,
    countries: groupSpend(
      found.filter(({ amount }) => amount < 0),
      ({ id }) => merchantCountries.get(id)!
    ).sort((a, b) => b.total - a.total),
  }
}

export async function analysePortfolio(filters: Pick<Filters, 'dateFrom' | 'dateTo'>) {
  const snapshots = (await db.portfolioSnapshots.orderBy('date').toArray()).filter(
    ({ date }) => (!filters.dateFrom || date >= filters.dateFrom) && (!filters.dateTo || date <= filters.dateTo)
  )
  const currency = snapshots.at(-1)?.currency
  const points = snapshots
    .filter((snapshot) => snapshot.currency === currency && Number.isFinite(snapshot.totalValue))
    .map(({ date, totalValue }) => ({ date, value: totalValue }))
  return {
    currency,
    from: points[0],
    to: points.at(-1),
    change: computeReturn(points),
    ignored: snapshots.length - points.length,
  }
}
