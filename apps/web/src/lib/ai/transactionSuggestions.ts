import type { Filters } from '../../pages/transactions/filterTypes'
import { fetchUnifiedRows } from '../brokerage/unifiedTransactions'
import { type DbTransaction, db } from '../db/db'
import { evaluateRules } from '../rules/evaluateRules'
import type { AiCategorisationContext, AiCategoryDecision, AiTransactionInput } from './categorisationProvider'
import { accountMask } from './privacy'

interface AiRunRow {
  transaction: DbTransaction
  ruleCategory: string | null
  input: AiTransactionInput
}

export interface AiSuggestion extends AiRunRow {
  decision: AiCategoryDecision
}

export interface AppliedAiCategory {
  id: string
  importedAt: string
  category?: string
  previousManualCategory?: string
  appliedCategoryId: string
}

type AiCategoryApplyResult =
  | { id: string; status: 'stale' | 'missing-category' }
  | (AppliedAiCategory & { status: 'saved' })

export async function prepareAiRun(filters: Filters): Promise<{ context: AiCategorisationContext; rows: AiRunRow[] }> {
  return db.transaction('r', [db.transactions, db.rules, db.categories], async () => {
    const { rows } = await fetchUnifiedRows({ ...filters, sourceType: 'bank' })
    const rules = await db.rules.orderBy('priority').toArray()
    const categories = await db.categories.toArray()
    const accountNumbers = (await db.transactions.orderBy('accountNo').uniqueKeys()).map(String)
    const mask = accountMask(accountNumbers)
    const categoryIds = new Set(categories.map(({ id }) => id))

    // Keep raw account, regex, and amount operands local. Rules with these conditions
    // still contribute the category of the first local rule match.
    const contextRules = rules
      .filter(
        (rule) =>
          rule.conditions?.length &&
          categoryIds.has(rule.category) &&
          rule.conditions.every(
            ({ field, operation, value }) =>
              (field === 'description' || field === 'source') &&
              operation !== 'regex' &&
              typeof value === 'string' &&
              mask(value) === value
          )
      )
      .map(({ category, conditions }) => ({ categoryId: category, conditions }))

    return {
      context: {
        categories: categories.map(({ id, name, isIncome }) => ({ id, name: mask(name), isIncome })),
        rules: contextRules,
      },
      rows: rows.flatMap(({ originalBank: transaction }, index) => {
        if (!transaction) return []
        const ruleCategory = evaluateRules(transaction, rules)

        return [
          {
            transaction,
            ruleCategory,
            input: {
              id: `row-${index}`,
              description: mask(transaction.description),
              source: mask(transaction.source),
              direction:
                transaction.transactionValue > 0 ? 'credit' : transaction.transactionValue < 0 ? 'debit' : 'zero',
              matchedRuleCategoryId: ruleCategory && categoryIds.has(ruleCategory) ? ruleCategory : undefined,
            },
          },
        ]
      }),
    }
  })
}

export async function acceptAiCategories(
  selections: { suggestion: AiSuggestion; categoryId: string }[],
  signal: AbortSignal
): Promise<AiCategoryApplyResult[]> {
  if (!selections.length) return []

  return db.transaction('rw', [db.transactions, db.rules, db.categories], async () => {
    const transactions = await db.transactions.bulkGet(selections.map(({ suggestion }) => suggestion.transaction.id))
    const rules = await db.rules.orderBy('priority').toArray()
    const categoryIds = [...new Set(selections.map(({ categoryId }) => categoryId))]
    const categories = await db.categories.bulkGet(categoryIds)
    const validIds = new Set(categories.flatMap((category) => (category ? [category.id] : [])))
    const updates: { key: string; changes: { manualCategory: string } }[] = []

    const results = selections.map(({ suggestion, categoryId }, index) => {
      const { transaction } = suggestion
      const current = transactions[index]
      const id = transaction.id
      if (
        !current ||
        current.manualCategory !== transaction.manualCategory ||
        current.category !== transaction.category ||
        current.importedAt !== transaction.importedAt ||
        evaluateRules(current, rules) !== suggestion.ruleCategory
      ) {
        return { id, status: 'stale' as const }
      }
      if (!validIds.has(categoryId)) return { id, status: 'missing-category' as const }
      updates.push({ key: id, changes: { manualCategory: categoryId } })
      return {
        id,
        status: 'saved' as const,
        importedAt: current.importedAt,
        category: current.category,
        previousManualCategory: current.manualCategory,
        appliedCategoryId: categoryId,
      }
    })

    signal.throwIfAborted()
    if (updates.length) await db.transactions.bulkUpdate(updates)
    return results
  })
}

export async function undoAiCategories(changes: AppliedAiCategory[]): Promise<string[]> {
  if (!changes.length) return []

  return db.transaction('rw', [db.transactions, db.categories], async () => {
    const transactions = await db.transactions.bulkGet(changes.map(({ id }) => id))
    const previousCategoryIds = [
      ...new Set(
        changes.flatMap((change) => {
          const categoryId = change.previousManualCategory ?? change.category
          return categoryId ? [categoryId] : []
        })
      ),
    ]
    const categories = await db.categories.bulkGet(previousCategoryIds)
    const validIds = new Set(categories.flatMap((category) => (category ? [category.id] : [])))
    const updates = changes.flatMap((change, index) => {
      const current = transactions[index]
      const previousCategory = change.previousManualCategory ?? change.category
      if (
        !current ||
        current.importedAt !== change.importedAt ||
        current.category !== change.category ||
        current.manualCategory !== change.appliedCategoryId ||
        (previousCategory && !validIds.has(previousCategory))
      ) {
        return []
      }
      return [{ key: change.id, changes: { manualCategory: change.previousManualCategory } }]
    })

    if (updates.length) await db.transactions.bulkUpdate(updates)
    return updates.map(({ key }) => key)
  })
}
