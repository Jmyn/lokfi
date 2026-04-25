import { describe, expect, it } from 'vitest'
import type { DbTransaction } from '../db/db'
import { extractIdentifier, extractPrefix, suggestRules } from './suggestRules'

// Minimal transaction factory — only fields suggestRules touches
function makeTxn(overrides: Partial<DbTransaction> & { id: string; description: string }): DbTransaction {
  return {
    hash: overrides.id,
    source: 'TESTBANK',
    accountNo: '123',
    date: '2026-01-01',
    transactionValue: -10,
    importedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ─── extractPrefix ────────────────────────────────────────────────────────────

describe('extractPrefix', () => {
  it('returns everything before the first numeric group', () => {
    expect(extractPrefix('GRAB*FOOD 99283')).toBe('GRAB*FOOD')
    expect(extractPrefix('NETS QR DRINKS STALL 23022986 NETS QR PURCHASE')).toBe('NETS QR DRINKS STALL')
    expect(extractPrefix('POS GRAB*FOOD 99283')).toBe('POS GRAB*FOOD')
  })

  it('returns the full description when no numeric group is present', () => {
    expect(extractPrefix('NETFLIX SG')).toBe('NETFLIX SG')
  })

  it('handles asterisk-delimited numerics', () => {
    expect(extractPrefix('GRAB*FOOD*99')).toBe('GRAB*FOOD')
  })
})

// ─── extractIdentifier ───────────────────────────────────────────────────────

describe('extractIdentifier', () => {
  describe('"to [MERCHANT]" pattern', () => {
    it('extracts merchant after "to" at end of description', () => {
      const result = extractIdentifier('FAST PAYMENT OTHR-200502526MPOS0142084 via PayNow-UEN to QI JI EATERY')
      expect(result).toEqual({ value: 'QI JI EATERY', operation: 'contains' })
    })

    it('extracts merchant when "via" follows without space', () => {
      const result = extractIdentifier('FAST PAYMENT OTHR-12345 to VIRKHAL PTE. LTDvia PayNow-UEN')
      expect(result).toEqual({ value: 'VIRKHAL PTE. LTD', operation: 'contains' })
    })

    it('extracts merchant from fund transfer with "to" pattern', () => {
      const result = extractIdentifier('FUND TRANSFER OTHR - QS via PayNow-QR Code to R.K. FATHIMA')
      expect(result).toEqual({ value: 'R.K. FATHIMA', operation: 'contains' })
    })

    it('extracts merchant from Qashier POS description', () => {
      const result = extractIdentifier('FAST PAYMENT OTHR-qsb-sqr-sg-12345 via PayNow-UEN to Qashier-SPRINGLE CAFE')
      expect(result).toEqual({ value: 'Qashier-SPRINGLE CAFE', operation: 'contains' })
    })

    it('does not match "to" inside a word (e.g. AUTOMATIC)', () => {
      const result = extractIdentifier('AUTOMATIC PAYMENT 12345')
      // Should fall back to prefix, not extract "MATIC PAYMENT"
      expect(result?.operation).toBe('startsWith')
    })
  })

  describe('prefix fallback', () => {
    it('returns prefix with startsWith for GRAB*FOOD', () => {
      const result = extractIdentifier('POS GRAB*FOOD 99283')
      expect(result).toEqual({ value: 'POS GRAB*FOOD', operation: 'startsWith' })
    })

    it('returns prefix for NETS QR descriptions', () => {
      const result = extractIdentifier('NETS QR DRINKS STALL 23022986 NETS QR PURCHASE')
      expect(result).toEqual({ value: 'NETS QR DRINKS STALL', operation: 'startsWith' })
    })

    it('returns prefix for subscription descriptions', () => {
      const result = extractIdentifier('PAYNOW NETFLIX SUBSCRIPTION 20241201')
      expect(result).toEqual({ value: 'PAYNOW NETFLIX SUBSCRIPTION', operation: 'startsWith' })
    })

    it('returns prefix for BONUS INTEREST', () => {
      const result = extractIdentifier('BONUS INTEREST 360 SAVE BONUS')
      expect(result).toEqual({ value: 'BONUS INTEREST', operation: 'startsWith' })
    })
  })

  describe('null cases', () => {
    it('returns null for all-noise description', () => {
      expect(extractIdentifier('POS IBG TRF 123456')).toBeNull()
    })

    it('returns null when prefix has no substance', () => {
      expect(extractIdentifier('FAST PAYMENT 99999')).toBeNull()
    })
  })
})

// ─── suggestRules ─────────────────────────────────────────────────────────────

describe('suggestRules', () => {
  const categoryId = 'cat-food'

  it('returns empty array when description is all noise', () => {
    const txn = makeTxn({ id: 't1', description: 'POS IBG TRF 99999' })
    const all = [txn, makeTxn({ id: 't2', description: 'POS IBG 88888' })]
    expect(suggestRules(txn, categoryId, all)).toEqual([])
  })

  it('returns both "suggested" and "exact" when they differ (PayNow pattern)', () => {
    const txn = makeTxn({
      id: 't1',
      description: 'FAST PAYMENT OTHR-200502526 via PayNow-UEN to QI JI EATERY',
      source: 'DBS',
    })
    const all = [
      txn,
      makeTxn({
        id: 't2',
        description: 'FAST PAYMENT OTHR-999999 via PayNow-UEN to QI JI EATERY',
        source: 'DBS',
      }),
      makeTxn({
        id: 't3',
        description: 'FUND TRANSFER to QI JI EATERY',
        source: 'DBS',
      }),
    ]

    const suggestions = suggestRules(txn, categoryId, all)
    expect(suggestions.length).toBe(2)

    const suggested = suggestions.find((s) => s.label === 'suggested')
    const exact = suggestions.find((s) => s.label === 'exact')

    // Suggested: contains "QI JI EATERY" → matches all 3
    expect(suggested?.conditions).toContainEqual({
      field: 'description',
      operation: 'contains',
      value: 'QI JI EATERY',
    })
    expect(suggested?.matchCount).toBe(3)

    // Exact: equals full description → matches only t1
    expect(exact?.conditions).toContainEqual({
      field: 'description',
      operation: 'equals',
      value: 'FAST PAYMENT OTHR-200502526 via PayNow-UEN to QI JI EATERY',
    })
    expect(exact?.matchCount).toBe(1)
  })

  it('returns both suggested (startsWith prefix) and exact (equals full desc) for prefix fallback', () => {
    const txn = makeTxn({ id: 't1', description: 'GRAB*FOOD 99283', source: 'DBS' })
    const all = [txn, makeTxn({ id: 't2', description: 'GRAB*FOOD 71234', source: 'DBS' })]

    const suggestions = suggestRules(txn, categoryId, all)
    expect(suggestions.length).toBe(2)

    const suggested = suggestions.find((s) => s.label === 'suggested')
    expect(suggested?.conditions).toContainEqual({
      field: 'description',
      operation: 'startsWith',
      value: 'GRAB*FOOD',
    })
    expect(suggested?.matchCount).toBe(2)

    const exact = suggestions.find((s) => s.label === 'exact')
    expect(exact?.conditions).toContainEqual({
      field: 'description',
      operation: 'equals',
      value: 'GRAB*FOOD 99283',
    })
    expect(exact?.matchCount).toBe(1)
  })

  it('suggested has no source filter, exact has source filter', () => {
    const txn = makeTxn({
      id: 't1',
      description: 'FAST PAYMENT OTHR-111 via PayNow to MERCHANT ABC',
      source: 'DBS',
    })
    const all = [
      txn,
      makeTxn({
        id: 't2',
        description: 'TRANSFER to MERCHANT ABC',
        source: 'DBS',
      }),
      makeTxn({
        id: 't3',
        description: 'TRANSFER to MERCHANT ABC',
        source: 'OCBC',
      }),
    ]

    const suggestions = suggestRules(txn, categoryId, all)
    const suggested = suggestions.find((s) => s.label === 'suggested')
    const exact = suggestions.find((s) => s.label === 'exact')

    // Suggested: contains "MERCHANT ABC", no source → all 3
    expect(suggested?.conditions.length).toBe(1)
    expect(suggested?.matchCount).toBe(3)

    // Exact: equals full desc + source=DBS → only t1
    expect(exact?.conditions).toContainEqual({
      field: 'source',
      operation: 'equals',
      value: 'DBS',
    })
    expect(exact?.matchCount).toBe(1)
  })

  it('includes up to 3 preview descriptions', () => {
    const txn = makeTxn({ id: 't1', description: 'GRAB*FOOD 1', source: 'DBS' })
    const all = [
      txn,
      makeTxn({ id: 't2', description: 'GRAB*FOOD 2', source: 'DBS' }),
      makeTxn({ id: 't3', description: 'GRAB*FOOD 3', source: 'DBS' }),
      makeTxn({ id: 't4', description: 'GRAB*FOOD 4', source: 'DBS' }),
    ]
    const suggestions = suggestRules(txn, categoryId, all)

    expect(suggestions[0].previewDescriptions.length).toBeLessThanOrEqual(3)
    expect(suggestions[0].matchCount).toBe(4)
  })

  it('handles transaction with no source', () => {
    const txn = makeTxn({
      id: 't1',
      description: 'NETFLIX SUBSCRIPTION 12345',
      source: '' as never,
    })
    const all = [txn, makeTxn({ id: 't2', description: 'NETFLIX SUBSCRIPTION 67890', source: '' as never })]

    const suggestions = suggestRules(txn, categoryId, all)
    // Both suggested (startsWith prefix) and exact (equals full desc) returned
    expect(suggestions.length).toBe(2)

    const suggested = suggestions.find((s) => s.label === 'suggested')
    // No source condition when source is empty
    expect(suggested?.conditions.length).toBe(1)
    expect(suggested?.conditions[0]).toEqual({
      field: 'description',
      operation: 'startsWith',
      value: 'NETFLIX SUBSCRIPTION',
    })

    const exact = suggestions.find((s) => s.label === 'exact')
    expect(exact?.conditions.length).toBe(1)
    expect(exact?.conditions[0]).toEqual({
      field: 'description',
      operation: 'equals',
      value: 'NETFLIX SUBSCRIPTION 12345',
    })
  })
})
