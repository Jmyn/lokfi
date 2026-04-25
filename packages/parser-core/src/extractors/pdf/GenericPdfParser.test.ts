import { describe, expect, it } from 'vitest'
import { GenericPdfParser } from './GenericPdfParser'

const GENERIC_FIXTURE = `Bank Statement
Account No: 1234-567890

01 Jan 2025 ATM WITHDRAWAL 100.00
05 Jan 2025 SUPERMARKET PURCHASE 45.60
12 Jan 2025 UTILITY BILL 120.00
25 Jan 2025 SALARY CREDIT 3000.00 CR`

describe('GenericPdfParser', () => {
  const parser = new GenericPdfParser()

  describe('parse()', () => {
    it('parses all 4 transactions including days 1–12 (bug G-1)', () => {
      const stmt = parser.parse(GENERIC_FIXTURE)
      expect(stmt.transactions).toHaveLength(4)
    })

    it('correctly parses date for day 01 (bug G-1)', () => {
      const stmt = parser.parse(GENERIC_FIXTURE)
      expect(stmt.transactions[0]!.date).toBe('2025-01-01')
    })

    it('correctly parses date for day 05 (bug G-1)', () => {
      const stmt = parser.parse(GENERIC_FIXTURE)
      expect(stmt.transactions[1]!.date).toBe('2025-01-05')
    })

    it('correctly parses date for day 12 — edge case (bug G-1)', () => {
      const stmt = parser.parse(GENERIC_FIXTURE)
      expect(stmt.transactions[2]!.date).toBe('2025-01-12')
    })

    it('correctly parses date for day 25 (bug G-1 — should already work, regression guard)', () => {
      const stmt = parser.parse(GENERIC_FIXTURE)
      expect(stmt.transactions[3]!.date).toBe('2025-01-25')
    })

    it('extracts account number, not a word like "holder" (bug G-2)', () => {
      const stmt = parser.parse(GENERIC_FIXTURE)
      expect(stmt.accountNo).toBe('1234-567890')
    })

    it('does not capture "holder" as account number (bug G-2)', () => {
      const fixtureWithHolder = `Bank Statement\nAccount holder: JOHN\nAccount No: 9876-543210\n\n01 Jan 2025 TEST 50.00`
      const stmt = parser.parse(fixtureWithHolder)
      expect(stmt.accountNo).toBe('9876-543210')
      expect(stmt.accountNo).not.toBe('holder')
      expect(stmt.accountNo).not.toBe('JOHN')
    })
  })
})
