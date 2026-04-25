import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { OcbcCreditPdfParser } from './OcbcCreditPdfParser'

/**
 * Simple fixture: single-section statement with DD/MM dates and a card number.
 * Covers the basic happy path and regression tests.
 */
const OCBC_SIMPLE_FIXTURE = `OCBC Bank
CREDIT CARD STATEMENT
01-11-2025 24-11-2025 S$27,500
TRANSACTION DATE DESCRIPTION AMOUNT (SGD)
OCBC NXT CREDIT CARD
TEST USER 5240-4066-0227-1234
LAST MONTH'S BALANCE 100.00
25/11 NTUC FAIRPRICE CO. LTD 45.60
05/11 GRAB TAXI 12.30
12/11 SINGTEL TOTAL PLAN 55.00
01/11 MCDONALDS SINGAPORE 8.50
SUBTOTAL 121.40
TOTAL 121.40`

/**
 * Multi-section fixture: mirrors the real Dec-25 OCBC consolidated statement structure.
 * Three card sections across two pages (page break simulated):
 *   - OCBC NXT main card (6 transactions)
 *   - OCBC NXT supplementary card (6 transactions)
 *   - OCBC 365 card (4 transactions spanning a page break)
 *
 * Stored as a separate file so it can be updated without touching test logic.
 * Personal data obfuscated: see __fixtures__/ocbc-credit-dec-25.txt.
 */
const OCBC_DEC25_FIXTURE = readFileSync(new URL('./__fixtures__/ocbc-credit-dec-25.txt', import.meta.url), 'utf-8')

describe('OcbcCreditPdfParser', () => {
  const parser = new OcbcCreditPdfParser()

  describe('detect()', () => {
    it('detects OCBC credit card statements', () => {
      expect(parser.detect(OCBC_SIMPLE_FIXTURE)).toBe(true)
    })

    it('rejects non-OCBC text', () => {
      expect(parser.detect('DBS Bank Statement\nDate Amount\n01 Jan 2025 100.00')).toBe(false)
    })

    it('detects real-format consolidated statement', () => {
      expect(parser.detect(OCBC_DEC25_FIXTURE)).toBe(true)
    })
  })

  describe('parse() — simple fixture', () => {
    it('parses all 4 transactions', () => {
      const stmt = parser.parse(OCBC_SIMPLE_FIXTURE)
      expect(stmt.transactions).toHaveLength(4)
    })

    it('description for first transaction has no date prefix (bug O-2)', () => {
      const stmt = parser.parse(OCBC_SIMPLE_FIXTURE)
      expect(stmt.transactions[0]!.description).toBe('NTUC FAIRPRICE CO. LTD')
    })

    it('description for "SINGTEL TOTAL PLAN" is preserved in full (bug O-3)', () => {
      const stmt = parser.parse(OCBC_SIMPLE_FIXTURE)
      expect(stmt.transactions[2]!.description).toBe('SINGTEL TOTAL PLAN')
    })

    it('parses date for first transaction correctly', () => {
      const stmt = parser.parse(OCBC_SIMPLE_FIXTURE)
      expect(stmt.transactions[0]!.date).toBe('2025-11-25')
    })

    it('extracts card number as accountNo (bug O-5)', () => {
      const stmt = parser.parse(OCBC_SIMPLE_FIXTURE)
      expect(stmt.accountNo).not.toBe('UNKNOWN-ACCOUNT')
      expect(stmt.accountNo).toMatch(/\d{4}$/)
    })

    it('first transaction is NTUC, not a phantom from the statement period header (bug O-1)', () => {
      const stmt = parser.parse(OCBC_SIMPLE_FIXTURE)
      expect(stmt.transactions[0]!.description).not.toMatch(/statement\s*period/i)
      expect(stmt.transactions[0]!.description).toBe('NTUC FAIRPRICE CO. LTD')
    })
  })

  describe('parse() — multi-section fixture (real Dec-25 structure)', () => {
    it('parses all 16 transactions across all card sections', () => {
      const stmt = parser.parse(OCBC_DEC25_FIXTURE)
      expect(stmt.transactions).toHaveLength(16)
    })

    it('does not return UNKNOWN-ACCOUNT', () => {
      const stmt = parser.parse(OCBC_DEC25_FIXTURE)
      expect(stmt.accountNo).not.toBe('UNKNOWN-ACCOUNT')
    })

    it('accountNo ends with 4 digits', () => {
      const stmt = parser.parse(OCBC_DEC25_FIXTURE)
      expect(stmt.accountNo).toMatch(/\d{4}$/)
    })

    it('no transaction description matches a date pattern (bug O-2 regression)', () => {
      const stmt = parser.parse(OCBC_DEC25_FIXTURE)
      for (const txn of stmt.transactions) {
        expect(txn.description).not.toMatch(/^\d{1,2}\/\d{2}/)
      }
    })

    it("LAST MONTH'S BALANCE lines are not parsed as transactions", () => {
      const stmt = parser.parse(OCBC_DEC25_FIXTURE)
      for (const txn of stmt.transactions) {
        expect(txn.description).not.toMatch(/last month/i)
      }
    })

    it('supplementary card transactions are included (not dropped at SUBTOTAL)', () => {
      const stmt = parser.parse(OCBC_DEC25_FIXTURE)
      const descriptions = stmt.transactions.map((t) => t.description)
      // Supplementary card transactions
      expect(descriptions).toContain('CITY HOSPITAL SINGAPORE SGP')
      expect(descriptions).toContain('INTERNET SERVICE SINGAPORE SGP')
    })

    it('OCBC 365 transactions across page break are included', () => {
      const stmt = parser.parse(OCBC_DEC25_FIXTURE)
      const descriptions = stmt.transactions.map((t) => t.description)
      expect(descriptions).toContain('LATE CHARGE REVERSAL')
      expect(descriptions).toContain('IPP ELECTRONICS 36M 026/036')
    })

    it('Instalment Payment Plan Summary rows are NOT parsed as transactions', () => {
      const stmt = parser.parse(OCBC_DEC25_FIXTURE)
      // IPP rows have DD MMM YYYY dates — should be excluded since parsing stops at TOTAL AMOUNT DUE
      for (const txn of stmt.transactions) {
        expect(txn.description).not.toMatch(/instalment/i)
      }
    })

    it('parenthesized amounts are parsed as negative (payments/credits)', () => {
      const stmt = parser.parse(OCBC_DEC25_FIXTURE)
      const payment = stmt.transactions.find((t) => t.description === 'PAYMENT BY INTERNET')
      expect(payment).toBeDefined()
      expect(payment!.transactionValue).toBeLessThan(0)
    })

    it('instalment plan transactions use the instalment amount, not the full purchase amount', () => {
      const stmt = parser.parse(OCBC_DEC25_FIXTURE)
      // Description is trimmed at the first amount ($2,000.00), giving "TRAVEL WALLET"
      const travelWallet = stmt.transactions.find((t) => t.description === 'TRAVEL WALLET')
      expect(travelWallet).toBeDefined()
      expect(travelWallet!.transactionValue).toBe(320)
    })

    it('each transaction is stamped with its card accountNo', () => {
      const stmt = parser.parse(OCBC_DEC25_FIXTURE)
      // All transactions should have accountNo set
      for (const txn of stmt.transactions) {
        expect(txn.accountNo).toBeDefined()
        expect(txn.accountNo).not.toBe('UNKNOWN-ACCOUNT')
      }
      // Three distinct accounts
      const accounts = [...new Set(stmt.transactions.map((t) => t.accountNo))]
      expect(accounts).toHaveLength(3)
    })

    it('supplementary card transactions carry their own accountNo, not the primary card', () => {
      const stmt = parser.parse(OCBC_DEC25_FIXTURE)
      const suppTxn = stmt.transactions.find((t) => t.description === 'CITY HOSPITAL SINGAPORE SGP')
      const primaryTxn = stmt.transactions.find((t) => t.description === 'TRAVEL WALLET')
      expect(suppTxn?.accountNo).not.toBe(primaryTxn?.accountNo)
    })

    it('dates are correctly constructed from DD/MM + statement year', () => {
      const stmt = parser.parse(OCBC_DEC25_FIXTURE)
      // stmtYear=2025, stmtMonth=12; all transaction months ≤ 12
      const cashRebate = stmt.transactions.find((t) => t.description === 'CASH REBATE')
      expect(cashRebate?.date).toBe('2025-12-01')
      const payment = stmt.transactions.find((t) => t.description === 'PAYMENT BY INTERNET')
      expect(payment?.date).toBe('2025-11-10')
    })
  })
})
