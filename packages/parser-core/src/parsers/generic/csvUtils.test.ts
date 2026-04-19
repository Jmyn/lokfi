import { describe, it, expect } from 'vitest'
import { normalizeDate, parseAmount, computeHeaderFingerprint } from './csvUtils'

describe('csvUtils', () => {
  describe('normalizeDate()', () => {
    it('handles ISO YYYY-MM-DD', () => {
      expect(normalizeDate('2025-01-15')).toBe('2025-01-15')
    })

    it('handles YYYY/MM/DD', () => {
      expect(normalizeDate('2025/01/15')).toBe('2025-01-15')
    })

    it('handles DD/MM/YYYY when DD > 12', () => {
      expect(normalizeDate('31/01/2025')).toBe('2025-01-31')
    })

    it('handles MM/DD/YYYY when DD > 12', () => {
      expect(normalizeDate('01/31/2025')).toBe('2025-01-31')
    })

    it('defaults to DD/MM/YYYY for ambiguous / dates', () => {
      expect(normalizeDate('01/02/2025')).toBe('2025-02-01')
    })

    it('handles DD-MM-YYYY when DD > 12', () => {
      expect(normalizeDate('31-01-2025')).toBe('2025-01-31')
    })

    it('handles MM-DD-YYYY when DD > 12', () => {
      expect(normalizeDate('01-31-2025')).toBe('2025-01-31')
    })

    it('defaults to DD/MM/YYYY for ambiguous - dates', () => {
      expect(normalizeDate('01-02-2025')).toBe('2025-02-01')
    })

    it('handles DD-MMM-YYYY', () => {
      expect(normalizeDate('25-Dec-2025')).toBe('2025-12-25')
      expect(normalizeDate('25-jan-2025')).toBe('2025-01-25')
    })

    it('handles DD MMM YYYY', () => {
      expect(normalizeDate('25 Dec 2025')).toBe('2025-12-25')
    })

    it('handles MMM DD, YYYY', () => {
      expect(normalizeDate('Dec 25, 2025')).toBe('2025-12-25')
      expect(normalizeDate('Jan 01 2025')).toBe('2025-01-01')
    })

    it('strips time component after space or T', () => {
      expect(normalizeDate('2025-01-15T12:00:00Z')).toBe('2025-01-15')
      expect(normalizeDate('2025-01-15 14:30:00')).toBe('2025-01-15')
    })

    it('falls back to Date.parse() for other formats', () => {
      // Date.parse('2025 January 15') -> ...
      const result = normalizeDate('January 15, 2025')
      expect(result).toBe('2025-01-15')
    })

    it('returns null for invalid dates', () => {
      expect(normalizeDate('not-a-date')).toBeNull()
      expect(normalizeDate('')).toBeNull()
    })
  })

  describe('parseAmount()', () => {
    it('parses standard numbers', () => {
      expect(parseAmount('123.45')).toBe(123.45)
      expect(parseAmount('  1000  ')).toBe(1000)
    })

    it('parses negative numbers with minus sign', () => {
      expect(parseAmount('-123.45')).toBe(-123.45)
    })

    it('parses negative numbers with parentheses', () => {
      expect(parseAmount('(123.45)')).toBe(-123.45)
    })

    it('handles currency symbols and commas', () => {
      expect(parseAmount('$1,234.56')).toBe(1234.56)
      expect(parseAmount('€100.00')).toBe(100)
      expect(parseAmount('£50')).toBe(50)
      expect(parseAmount('¥1000')).toBe(1000)
    })

    it('handles leading currency codes', () => {
      expect(parseAmount('USD 100.00')).toBe(100)
      expect(parseAmount('SGD 50')).toBe(50)
      expect(parseAmount('RM 10.50')).toBe(10.5)
    })

    it('returns null for empty or invalid strings', () => {
      expect(parseAmount('')).toBeNull()
      expect(parseAmount('abc')).toBeNull()
      expect(parseAmount('   ')).toBeNull()
    })
  })

  describe('computeHeaderFingerprint()', () => {
    it('computes fingerprint for a valid header row', () => {
      const rows = [
        ['Date', 'Description', 'Amount'],
      ]
      expect(computeHeaderFingerprint(rows)).toBe('amount|date|description')
    })

    it('handles extra whitespace and different casing', () => {
      const rows = [
        ['  DATE  ', ' desc ', ' AmOuNt '],
      ]
      expect(computeHeaderFingerprint(rows)).toBe('amount|date|desc')
    })

    it('skips rows with fewer than 2 non-empty columns', () => {
      const rows = [
        ['Statement'],
        ['Account: 123'],
        [],
        ['Date', 'Amount'],
      ]
      expect(computeHeaderFingerprint(rows)).toBe('amount|date')
    })

    it('returns empty string if no valid header found', () => {
      expect(computeHeaderFingerprint([])).toBe('')
      expect(computeHeaderFingerprint([['OneColumn']])).toBe('')
    })
  })
})
