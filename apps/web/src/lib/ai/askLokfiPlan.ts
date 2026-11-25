import { z } from 'zod'

const scopeKeys = ['dateFrom', 'dateTo', 'source', 'account', 'category', 'description'] as const
const actions = ['spending', 'portfolio', 'overseas', 'show_transactions', 'draft_rule', 'clarify'] as const
const scopeBases = ['current_filters', 'current_results', 'previous_query', 'previous_results', 'all'] as const
const reports = ['spending', 'overseas', 'portfolio'] as const
const clarificationKinds = ['rule_category', 'rule_description', 'account', 'amount_filter', 'other'] as const

const nullableText = z.string().max(240).nullable()
const scopeSchema = z.object({
  dateFrom: nullableText,
  dateTo: nullableText,
  source: nullableText,
  account: nullableText,
  category: nullableText,
  description: nullableText,
  excludeCategories: z.array(z.string().max(240)).max(100).nullable(),
  excludeTransfers: z.boolean().nullable(),
  excludeInvestments: z.boolean().nullable(),
})

export const askPlanSchema = z.object({
  action: z.enum(actions),
  scopeBase: z.enum(scopeBases),
  report: z.enum(reports).nullable(),
  scope: scopeSchema,
  rule: z
    .object({ name: nullableText, category: nullableText, description: nullableText, source: nullableText })
    .nullable(),
  clarificationKind: z.enum(clarificationKinds).nullable(),
  message: nullableText,
})

const text = { type: ['string', 'null'] }
const object = (properties: Record<string, object>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

export const askPlanJsonSchema = object({
  action: { type: 'string', enum: actions },
  scopeBase: { type: 'string', enum: scopeBases },
  report: { anyOf: [{ type: 'string', enum: reports }, { type: 'null' }] },
  scope: object({
    ...Object.fromEntries(scopeKeys.map((key) => [key, text])),
    excludeCategories: { type: ['array', 'null'], items: { type: 'string' } },
    excludeTransfers: { type: ['boolean', 'null'] },
    excludeInvestments: { type: ['boolean', 'null'] },
  }),
  rule: { anyOf: [object({ name: text, category: text, description: text, source: text }), { type: 'null' }] },
  clarificationKind: { anyOf: [{ type: 'string', enum: clarificationKinds }, { type: 'null' }] },
  message: text,
})

export type AskPlan = z.infer<typeof askPlanSchema>
export type AskAction = Exclude<AskPlan['action'], 'clarify'>
export type AskReport = (typeof reports)[number]
export type AskClarificationKind = (typeof clarificationKinds)[number]
export const pendingRuleDescription = 'pending_rule_description'
type AskRequestScope = Record<string, string | string[] | boolean | number | null>
type AskRequestTurn = { intent: AskAction; query: AskRequestScope; resultCount: number | null }

export interface AskLokfiRequest {
  question: string
  today: string
  page: string
  sources: { key: string; label: string }[]
  accounts: { key: string; label: string }[]
  categories: { key: string; label: string }[]
  currentScope: AskRequestScope
  previous: AskRequestTurn | null
  reports: Partial<Record<AskReport, AskRequestTurn>>
  clarification?: {
    kind: AskClarificationKind
    rule?: { hasDescription: boolean; category: string | null; source: string | null }
  }
}

export interface AskLokfiProvider {
  plan(request: AskLokfiRequest, signal: AbortSignal): Promise<AskPlan>
}
