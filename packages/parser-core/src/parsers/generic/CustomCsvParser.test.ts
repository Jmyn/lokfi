import { describe, expect, it } from 'vitest'
import type { CustomParserProfile } from '../../types'
import { CustomCsvParser } from './CustomCsvParser'

const baseProfile: CustomParserProfile = {
  id: 'test-1',
  name: 'Test Bank',
  headerFingerprint: 'amount|date|description',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  columnMap: { date: 0, description: 1, amount: 2 },
  skipRows: 0,
  statementType: 'debit',
  negateAmount: false,
  source: 'generic',
}

const CSV_SINGLE_AMT = `date,description,amount
2025-01-15,Coffee Shop,-4.50
2025-01-16,Salary,3000.00
`

const CSV_SPLIT_AMT = `date,description,debit,credit
2025-01-15,Coffee Shop,4.50,
2025-01-16,Salary,,3000.00
`

const CSV_SKIP_ROWS = `Bank Export
Account: 123-456
date,description,amount
2025-01-15,Coffee Shop,-4.50
`

describe('CustomCsvParser', () => {
  describe('detect()', () => {
    it('matches when header fingerprint equals profile fingerprint', () => {
      const parser = new CustomCsvParser(baseProfile)
      expect(parser.detect(CSV_SINGLE_AMT)).toBe(true)
    })

    it('does not match a CSV with different headers', () => {
      const parser = new CustomCsvParser(baseProfile)
      const different = 'txn_date,memo,value\n2025-01-01,test,10\n'
      expect(parser.detect(different)).toBe(false)
    })
  })

  describe('parse() - single amount column', () => {
    it('parses transactions with correct date, description, amount', () => {
      const parser = new CustomCsvParser(baseProfile)
      const result = parser.parse(CSV_SINGLE_AMT)
      expect(result.transactions).toHaveLength(2)
      expect(result.transactions[0]).toEqual({
        date: '2025-01-15',
        description: 'Coffee Shop',
        transactionValue: -4.5,
      })
      expect(result.transactions[1]!.transactionValue).toBe(3000)
    })

    it('applies negateAmount when enabled', () => {
      const parser = new CustomCsvParser({ ...baseProfile, negateAmount: true })
      const result = parser.parse(CSV_SINGLE_AMT)
      expect(result.transactions[0]!.transactionValue).toBe(4.5)
      expect(result.transactions[1]!.transactionValue).toBe(-3000)
    })

    it('sets source and statementType from profile', () => {
      const parser = new CustomCsvParser({
        ...baseProfile,
        source: 'ocbc',
        statementType: 'credit',
      })
      const result = parser.parse(CSV_SINGLE_AMT)
      expect(result.source).toBe('ocbc')
      expect(result.statementType).toBe('credit')
    })
  })

  describe('parse() - split debit/credit columns', () => {
    const splitProfile: CustomParserProfile = {
      ...baseProfile,
      headerFingerprint: 'credit|date|debit|description',
      columnMap: { date: 0, description: 1, debit: 2, credit: 3 },
    }

    it('parses debit rows as negative and credit rows as positive', () => {
      const parser = new CustomCsvParser(splitProfile)
      const result = parser.parse(CSV_SPLIT_AMT)
      expect(result.transactions[0]!.transactionValue).toBe(-4.5)
      expect(result.transactions[1]!.transactionValue).toBe(3000)
    })
  })

  describe('detect() with skipRows', () => {
    it('correctly matches a profile with skipRows > 0', () => {
      // CSV_SKIP_ROWS has 2 preamble rows then the header
      const profileWithSkip: CustomParserProfile = {
        ...baseProfile,
        headerFingerprint: 'amount|date|description', // same header as CSV_SKIP_ROWS row[2]
        skipRows: 2,
      }
      const parser = new CustomCsvParser(profileWithSkip)
      expect(parser.detect(CSV_SKIP_ROWS)).toBe(true)
    })

    it('does not match when skipRows points to a preamble row', () => {
      const profileWrongSkip: CustomParserProfile = {
        ...baseProfile,
        headerFingerprint: 'amount|date|description',
        skipRows: 0, // will fingerprint "Bank Export" row, not the header
      }
      const parser = new CustomCsvParser(profileWrongSkip)
      expect(parser.detect(CSV_SKIP_ROWS)).toBe(false)
    })
  })

  describe('parse() - skipRows', () => {
    it('skips the specified number of rows before the header', () => {
      const parser = new CustomCsvParser({ ...baseProfile, skipRows: 2 })
      const result = parser.parse(CSV_SKIP_ROWS)
      expect(result.transactions).toHaveLength(1)
      expect(result.transactions[0]!.description).toBe('Coffee Shop')
    })
  })

  describe('parse() - accountNo override', () => {
    it('uses override accountNo when provided', () => {
      const parser = new CustomCsvParser({ ...baseProfile, accountNo: 'ACC-9999' })
      const result = parser.parse(CSV_SINGLE_AMT)
      expect(result.accountNo).toBe('ACC-9999')
    })
  })
})
