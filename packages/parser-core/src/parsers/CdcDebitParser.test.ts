import { describe, it, expect } from 'vitest'
import { CdcDebitParser } from './CdcDebitParser'
import { ParseError } from '../types'

describe('CdcDebitParser', () => {
  const parser = new CdcDebitParser()

  const validCsv = `Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind,Transaction Hash
2025-12-22 18:42:13,Ntuc Fp   Northshore Dr,SGD,-6.82,,,SGD,-6.82,-5.08,vpos_purchase,0xhash1
2025-12-21 15:30:00,Top Up from Bank,SGD,100.00,,,SGD,100.00,74.50,top_up,0xhash2`

  const invalidCsv = `Date,Description,Amount\n2025-12-22,Something,10`

  describe('detect', () => {
    it('returns true for valid CDC CSV header', () => {
      expect(parser.detect(validCsv)).toBe(true)
    })

    it('returns false for invalid header', () => {
      expect(parser.detect(invalidCsv)).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(parser.detect('')).toBe(false)
    })
  })

  describe('parse', () => {
    it('parses transactions correctly', () => {
      const statement = parser.parse(validCsv)
      
      expect(statement.source).toBe('cdc')
      expect(statement.statementType).toBe('debit')
      expect(statement.accountNo).toBe('CDC-CARD')
      expect(statement.transactions).toHaveLength(2)

      expect(statement.transactions[0]).toEqual({
        date: '2025-12-22',
        description: 'Ntuc Fp   Northshore Dr',
        transactionValue: -6.82,
      })

      expect(statement.transactions[1]).toEqual({
        date: '2025-12-21',
        description: 'Top Up from Bank',
        transactionValue: 100.00,
      })
    })

    it('throws ParseError for invalid CSV', () => {
      expect(() => parser.parse(invalidCsv)).toThrow(ParseError)
    })
  })
})
