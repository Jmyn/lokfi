import { describe, expect, it } from 'vitest'
import { ParseError } from '../../types'
import { GenericCsvParser } from './GenericCsvParser'

describe('GenericCsvParser', () => {
  const parser = new GenericCsvParser()

  // ---------------------------------------------------------------------------
  // detect()
  // ---------------------------------------------------------------------------

  it('should detect CSV contents', () => {
    expect(parser.detect('Date,Amount\n2025-01-01,100')).toBe(true)
    expect(parser.detect('Not a csv')).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Core parsing (existing behaviour)
  // ---------------------------------------------------------------------------

  it('should parse standard header names', () => {
    const csv = `Date,Description,Amount\n2025-12-25,Christmas Gift,-100\n2025-12-26,Salary,5000`
    const stmt = parser.parse(csv)

    expect(stmt.source).toBe('generic')
    expect(stmt.transactions).toHaveLength(2)
    expect(stmt.transactions[0]).toEqual({
      date: '2025-12-25',
      description: 'Christmas Gift',
      transactionValue: -100,
    })
    expect(stmt.transactions[1]).toEqual({
      date: '2025-12-26',
      description: 'Salary',
      transactionValue: 5000,
    })
  })

  it('should infer properties from headerless or weird CSVs', () => {
    // col 0: junk, col 1: description, col 2: date, col 3: amount
    const csv = `Header1,Header2,H3,H4\nXYZ,Amazon Purchase,25/12/2025,-15.50`
    const stmt = parser.parse(csv)

    expect(stmt.transactions).toHaveLength(1)
    expect(stmt.transactions[0]).toEqual({
      date: '2025-12-25',
      description: 'Amazon Purchase',
      transactionValue: -15.5,
    })
  })

  it('should throw if no columns match safely', () => {
    const csv = `Unknown,Header\nValue1,Value2`
    expect(() => parser.parse(csv)).toThrow(ParseError)
  })

  // ---------------------------------------------------------------------------
  // Date format handling
  // ---------------------------------------------------------------------------

  it('should normalise DD-MM-YYYY dates', () => {
    const csv = `Date,Amount\n25-12-2025,10`
    expect(parser.parse(csv).transactions[0]?.date).toBe('2025-12-25')
  })

  it('should normalise DD/MM/YYYY dates', () => {
    const csv = `Date,Amount\n25/12/2025,10`
    expect(parser.parse(csv).transactions[0]?.date).toBe('2025-12-25')
  })

  it('should normalise YYYY/MM/DD dates', () => {
    const csv = `Date,Amount\n2025/12/25,10`
    expect(parser.parse(csv).transactions[0]?.date).toBe('2025-12-25')
  })

  it('should disambiguate MM/DD/YYYY when day > 12', () => {
    // 01/15/2025 → month=01, day=15
    const csv = `Date,Amount\n01/15/2025,100`
    expect(parser.parse(csv).transactions[0]?.date).toBe('2025-01-15')
  })

  it('should normalise DD-MMM-YYYY dates (25-Dec-2025)', () => {
    const csv = `Date,Amount\n25-Dec-2025,50`
    expect(parser.parse(csv).transactions[0]?.date).toBe('2025-12-25')
  })

  it('should normalise DD MMM YYYY dates (25 Dec 2025)', () => {
    const csv = `Date,Amount\n25 Dec 2025,50`
    expect(parser.parse(csv).transactions[0]?.date).toBe('2025-12-25')
  })

  it('should normalise MMM DD, YYYY dates (Dec 25, 2025)', () => {
    const csv = `Date,Amount\n"Dec 25, 2025",50`
    expect(parser.parse(csv).transactions[0]?.date).toBe('2025-12-25')
  })

  // ---------------------------------------------------------------------------
  // Amount parsing
  // ---------------------------------------------------------------------------

  it('should parse parenthetical negatives (100.00) as negative', () => {
    const csv = `Date,Amount\n2025-01-01,(100.00)`
    const tx = parser.parse(csv).transactions[0]!
    expect(tx.transactionValue).toBe(-100)
  })

  it('should parse parenthetical amounts with commas (1,234.56)', () => {
    // The value must be CSV-quoted so the comma inside is not treated as a delimiter
    const csv = `Date,Amount\n2025-01-01,"(1,234.56)"`
    const tx = parser.parse(csv).transactions[0]!
    expect(tx.transactionValue).toBe(-1234.56)
  })

  it('should strip currency symbols (€)', () => {
    const csv = `Date,Amount\n2025-01-01,€50.00`
    expect(parser.parse(csv).transactions[0]?.transactionValue).toBe(50)
  })

  it('should strip currency symbols (£)', () => {
    const csv = `Date,Amount\n2025-01-01,£75.99`
    expect(parser.parse(csv).transactions[0]?.transactionValue).toBe(75.99)
  })

  it('should strip leading currency codes (SGD)', () => {
    const csv = `Date,Amount\n2025-01-01,SGD100.00`
    expect(parser.parse(csv).transactions[0]?.transactionValue).toBe(100)
  })

  // ---------------------------------------------------------------------------
  // Extended keyword support
  // ---------------------------------------------------------------------------

  it('should match "Narrative" as description column', () => {
    const csv = `Date,Narrative,Amount\n2025-01-01,Grab Food,-5.50`
    const tx = parser.parse(csv).transactions[0]!
    expect(tx.description).toBe('Grab Food')
  })

  it('should match "Narration" as description column', () => {
    const csv = `Date,Narration,Amount\n2025-01-01,Transfer in,1000`
    expect(parser.parse(csv).transactions[0]?.description).toBe('Transfer in')
  })

  it('should match "Memo" as description column', () => {
    const csv = `Date,Memo,Amount\n2025-01-01,Grocery,-30`
    expect(parser.parse(csv).transactions[0]?.description).toBe('Grocery')
  })

  it('should match "Txn Date" as date column', () => {
    const csv = `Txn Date,Description,Amount\n2025-06-15,Coffee,-4`
    const tx = parser.parse(csv).transactions[0]!
    expect(tx.date).toBe('2025-06-15')
    expect(tx.description).toBe('Coffee')
  })

  it('should match "Dr" / "Cr" split columns', () => {
    const csv = `Date,Narration,Dr,Cr\n2025-01-01,ATM Withdrawal,500,\n2025-01-02,Salary Credit,,3000`
    const stmt = parser.parse(csv)
    expect(stmt.transactions).toHaveLength(2)
    expect(stmt.transactions[0]?.transactionValue).toBe(-500)
    expect(stmt.transactions[1]?.transactionValue).toBe(3000)
  })

  // ---------------------------------------------------------------------------
  // Balance column
  // ---------------------------------------------------------------------------

  it('should extract balance column when present', () => {
    const csv = `Date,Amount,Balance\n2025-01-01,-100,400\n2025-01-02,50,450`
    const stmt = parser.parse(csv)
    expect(stmt.transactions[0]?.balance).toBe(400)
    expect(stmt.transactions[1]?.balance).toBe(450)
  })

  // ---------------------------------------------------------------------------
  // Row filtering
  // ---------------------------------------------------------------------------

  it('should skip whitespace-only rows', () => {
    const csv = `Date,Amount\n2025-01-01,100\n  ,  \n2025-01-02,50`
    const stmt = parser.parse(csv)
    expect(stmt.transactions).toHaveLength(2)
  })

  // ---------------------------------------------------------------------------
  // Source detection
  // ---------------------------------------------------------------------------

  it('should detect OCBC as source from metadata', () => {
    const csv = `OCBC Bank Statement\nDate,Description,Amount\n2025-01-01,Transfer,-200`
    expect(parser.parse(csv).source).toBe('ocbc')
  })

  it('should detect DBS as source from metadata', () => {
    const csv = `DBS Digibank\nDate,Description,Amount\n2025-01-01,Payment,-50`
    expect(parser.parse(csv).source).toBe('dbs')
  })

  it('should detect Maybank as source from metadata', () => {
    const csv = `Maybank Account Statement\nDate,Description,Amount\n2025-01-01,ATM,-100`
    expect(parser.parse(csv).source).toBe('maybank')
  })

  it('should fall back to generic source when bank is unknown', () => {
    const csv = `Date,Description,Amount\n2025-01-01,Purchase,-50`
    expect(parser.parse(csv).source).toBe('generic')
  })

  // ---------------------------------------------------------------------------
  // Account number extraction
  // ---------------------------------------------------------------------------

  it('should extract account number from metadata rows', () => {
    const csv = `Account No: 123-456789-0\nDate,Description,Amount\n2025-01-01,Purchase,-50`
    expect(parser.parse(csv).accountNo).toBe('123-456789-0')
  })

  it('should extract account number variant (Account Number:)', () => {
    const csv = `Account Number: 9876543210\nDate,Description,Amount\n2025-01-01,Purchase,-50`
    expect(parser.parse(csv).accountNo).toBe('9876543210')
  })

  it('should fall back to UNKNOWN-ACCOUNT when no account info found', () => {
    const csv = `Date,Description,Amount\n2025-01-01,Purchase,-50`
    expect(parser.parse(csv).accountNo).toBe('UNKNOWN-ACCOUNT')
  })
})
