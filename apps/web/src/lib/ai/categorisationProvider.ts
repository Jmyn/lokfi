import type { RuleCondition } from '../db/db'

export interface AiTransactionInput {
  id: string
  description: string
  source: string
  direction: 'credit' | 'debit' | 'zero'
  matchedRuleCategoryId?: string
}

export interface AiCategorisationContext {
  categories: { id: string; name: string; isIncome: boolean }[]
  rules: { categoryId: string; conditions: RuleCondition[] }[]
}

export type AiCategoryDecision =
  | { type: 'category'; categoryId: string; confidence?: number }
  | { type: 'unavailable'; reason?: 'input-too-large' }

export interface AiCategorisationProvider {
  suggestCategories(
    transactions: AiTransactionInput[],
    context: AiCategorisationContext,
    signal: AbortSignal,
    onBatch?: (results: ReadonlyMap<string, AiCategoryDecision>) => void
  ): Promise<Map<string, AiCategoryDecision>>
}
