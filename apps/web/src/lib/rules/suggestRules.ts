import type { DbTransaction, RuleCondition } from '../db/db'
import { matchesCondition } from './evaluateRules'

export type RuleSuggestion = {
  label: 'suggested' | 'exact'
  conditions: RuleCondition[]
  matchCount: number
  previewDescriptions: string[]
}

const NOISE_WORDS = new Set([
  // Generic banking operation prefixes
  'POS',
  'IBG',
  'PURCHASE',
  'DEBIT',
  'CREDIT',
  'TRANSFER',
  'PAYMENT',
  'TRF',
  'CR',
  'DR',
  'REF',
  // Payment networks / rails (not merchant names)
  'NETS',
  'NETSQR',
  'PAYNOW',
  'PAYLAH',
  'GIRO',
  'ATM',
  'VISA',
  'MASTERCARD',
  'CONTACTLESS',
  'CARDLESS',
  'INTERBANK',
  'OVERSEAS',
  'FAST',
])

/** Collapse runs of whitespace into single spaces and trim. */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Extracts the stable prefix of a description: everything up to the first
 * standalone numeric group (a reference number). Bank descriptions commonly
 * append a variable reference number at the end, e.g. "GRAB*FOOD 99283".
 * Using startsWith this prefix matches future transactions regardless of
 * the reference number.
 */
export function extractPrefix(description: string): string {
  return normalizeWhitespace(description.replace(/[\*\s\-\/]\d+[\s\S]*$/, ''))
}

/**
 * Extracts a meaningful identifier from a bank transaction description.
 *
 * Tries heuristics in order:
 * 1. "to [MERCHANT]" pattern — captures merchant/recipient at end (Singapore PayNow/transfer format)
 * 2. Prefix-based fallback — stable prefix before first numeric group, if it contains substance
 * 3. null — no meaningful identifier found
 */
export function extractIdentifier(description: string): { value: string; operation: 'contains' | 'startsWith' } | null {
  // 1. Try "to [MERCHANT]" pattern (Singapore PayNow/transfer format)
  //    Handles: "... to QI JI EATERY", "... to VIRKHAL PTE. LTDvia PayNow"
  const toMatch = description.match(/\bto\s+(.+?)(?=\s*via\b|$)/i)
  if (toMatch) {
    const merchant = normalizeWhitespace(toMatch[1])
    if (merchant.length >= 3) {
      return { value: merchant, operation: 'contains' }
    }
  }

  // 2. Fall back to stable prefix (before first numeric group)
  //    Keep full prefix (including noise words) for startsWith matching
  //    but only use it if it contains at least one meaningful token
  const prefix = extractPrefix(description)
  if (prefix) {
    const hasSubstance = prefix
      .split(/[\*\s\-\/]+/)
      .some((t) => t.length >= 3 && !/^\d+$/.test(t) && !NOISE_WORDS.has(t.toUpperCase()))
    if (hasSubstance) {
      return { value: prefix, operation: 'startsWith' }
    }
  }

  return null
}

function conditionsEqual(a: RuleCondition[], b: RuleCondition[]): boolean {
  if (a.length !== b.length) return false
  return a.every(
    (cond, i) => cond.field === b[i].field && cond.operation === b[i].operation && cond.value === b[i].value
  )
}

function buildSuggestion(
  label: RuleSuggestion['label'],
  conditions: RuleCondition[],
  allTransactions: DbTransaction[]
): RuleSuggestion {
  const matching = allTransactions.filter((t) => conditions.every((cond) => matchesCondition(t, cond)))
  return {
    label,
    conditions,
    matchCount: matching.length,
    previewDescriptions: matching.slice(0, 3).map((t) => t.description),
  }
}

/**
 * Given a transaction that was just manually categorized, generate up to 2
 * rule suggestions (suggested / exact) the user can apply with one click.
 *
 * - "suggested" uses the extracted identifier (merchant name via "to" pattern,
 *   or cleaned prefix) with the best-fit operation (contains or startsWith).
 * - "exact" uses equals on the full description for a verbatim match.
 *
 * Returns an empty array when no useful identifier can be extracted.
 * Deduplicates: if both suggestions produce identical conditions, only one is returned.
 */
export function suggestRules(
  txn: DbTransaction,
  _categoryId: string,
  allTransactions: DbTransaction[]
): RuleSuggestion[] {
  const identifier = extractIdentifier(txn.description)
  if (!identifier) return []

  // Smart suggestion: uses extracted identifier only (no source constraint)
  const smartConditions: RuleCondition[] = [
    { field: 'description', operation: identifier.operation, value: identifier.value },
  ]

  // Exact fallback: equals full description + source
  const tightConditions: RuleCondition[] = [
    { field: 'description', operation: 'equals', value: normalizeWhitespace(txn.description) },
  ]
  if (txn.source) {
    tightConditions.push({ field: 'source', operation: 'equals', value: txn.source })
  }

  const smart = buildSuggestion('suggested', smartConditions, allTransactions)
  const tight = buildSuggestion('exact', tightConditions, allTransactions)

  const results: RuleSuggestion[] = []

  // Always include smart if it has matches
  if (smart.matchCount > 0) results.push(smart)

  // Include tight only if its conditions differ from smart
  if (tight.matchCount > 0 && !conditionsEqual(smart.conditions, tight.conditions)) {
    results.push(tight)
  }

  return results
}
