import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CitibankCreditPdfParser } from './CitibankCreditPdfParser'

const statement = readFileSync(new URL('./__fixtures__/citibank-credit.txt', import.meta.url), 'utf-8')
const parser = new CitibankCreditPdfParser()

describe('CitibankCreditPdfParser', () => {
  it('detects the Citi Singapore credit layout', () => {
    expect(parser.detect(statement)).toBe(true)
    expect(parser.detect(statement.replaceAll('Citibank Singapore Ltd', 'Another Bank'))).toBe(false)
    expect(parser.detect('Citibank Singapore Ltd\nDate,Description,Amount')).toBe(false)
  })

  it('reads both transaction pages with card, rollover dates, and signed SGD amounts', () => {
    const accountNo = '0000000000001234'
    expect(parser.parse(statement)).toEqual({
      source: 'citibank',
      statementType: 'credit',
      accountNo,
      transactions: [
        { date: '2025-12-20', description: 'PAYMENT RECEIVED', transactionValue: 200, accountNo },
        { date: '2025-12-27', description: 'SAMPLE MARKET Singapore', transactionValue: -1250.2, accountNo },
        { date: '2026-01-06', description: 'SAMPLE REFUND', transactionValue: 23.45, accountNo },
        { date: '2026-01-08', description: 'INTEREST', transactionValue: -5, accountNo },
      ],
    })
  })

  it('fails on a dated row with a missing amount instead of returning a partial statement', () => {
    expect(() => parser.parse(statement.replace('INTEREST   5.00', 'INTEREST'))).toThrow(
      'Could not read a Citibank transaction amount'
    )
  })

  it('fails on impossible calendar dates', () => {
    expect(() => parser.parse(statement.replace('27 DEC', '32 DEC'))).toThrow('Invalid transaction date')
  })
})
