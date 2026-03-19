import type { DbTransaction, DbRule, RuleCondition } from '../db/db'

export function matchesCondition(txn: DbTransaction, cond: RuleCondition): boolean {
  const fieldValue = txn[cond.field]

  if (fieldValue === undefined || fieldValue === null) {
    return false
  }

  // Handle numeric operations
  if (cond.field === 'transactionValue') {
    const numValue = Number(fieldValue)
    if (isNaN(numValue)) return false

    switch (cond.operation) {
      case 'gt':
        return numValue > Number(cond.value)
      case 'lt':
        return numValue < Number(cond.value)
      case 'between': {
        if (Array.isArray(cond.value) && cond.value.length === 2) {
          const [min, max] = cond.value
          return numValue >= Number(min) && numValue <= Number(max)
        }
        return false
      }
      default:
        return false
    }
  }

  // Handle string operations (case-insensitive, whitespace-normalized)
  const strValue = String(fieldValue).replace(/\s+/g, ' ').trim().toLowerCase()
  const condStrValue = String(cond.value).replace(/\s+/g, ' ').trim().toLowerCase()

  switch (cond.operation) {
    case 'contains':
      return strValue.includes(condStrValue)
    case 'equals':
      return strValue === condStrValue
    case 'startsWith':
      return strValue.startsWith(condStrValue)
    case 'regex':
      try {
        const regex = new RegExp(String(cond.value), 'i')
        return regex.test(String(fieldValue))
      } catch (e) {
        return false
      }
    default:
      return false
  }
}

/**
 * Evaluates a transaction against a list of rules.
 * Rules should be pre-sorted by priority (lower number = higher priority),
 * but this function ensures sorting just in case.
 * Returns the category ID of the first matching rule, or null if none match.
 */
export function evaluateRules(txn: DbTransaction, rules: DbRule[]): string | null {
  // Sort rules by priority ascending (lower number wins)
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority)

  for (const rule of sortedRules) {
    if (!rule.conditions || rule.conditions.length === 0) continue

    // A rule matches if ALL of its conditions match (AND logic)
    const ruleMatches = rule.conditions.every((cond) => matchesCondition(txn, cond))

    if (ruleMatches) {
      return rule.category
    }
  }

  return null
}
