import Papa from 'papaparse'
import { StatementParser, Statement, StatementSource, Transaction, ParseError } from '../../types'
import { parseAmount, normalizeDate } from './csvUtils'

// ---------------------------------------------------------------------------
// Keyword sets for header detection
// ---------------------------------------------------------------------------

const DATE_KEYWORDS = new Set([
  'date', 'transaction date', 'posting date', 'txn date', 'trans date',
  'entry date', 'trx date', 'trade date',
])
const DESC_KEYWORDS = new Set([
  'desc', 'description', 'particulars', 'merchant', 'narrative', 'narration',
  'memo', 'details', 'payee', 'reference', 'remark',
])
// "name" alone is too broad (matches "account name", "customer name"), so we handle it separately
const NAME_EXACT = new Set(['name', 'payee name', 'merchant name'])
const AMT_KEYWORDS = new Set([
  'amount', 'transaction amount', 'amt', 'net amount', 'transaction_amount',
])
const WDL_KEYWORDS = new Set([
  'withdrawal', 'debit', 'debit amount', 'dr', 'dr amount', 'charges',
])
const DEP_KEYWORDS = new Set([
  'deposit', 'credit', 'credit amount', 'cr', 'cr amount',
])
const BAL_KEYWORDS = new Set(['balance', 'running balance', 'closing balance', 'bal'])

// ---------------------------------------------------------------------------
// Bank source hints — scanned against first 2000 chars of raw text
// ---------------------------------------------------------------------------

const BANK_HINTS: Array<[RegExp, StatementSource]> = [
  [/\bocbc\b/i,                      'ocbc'],
  [/\bdbs\b/i,                       'dbs'],
  [/\buob\b|united overseas bank/i,  'uob'],
  [/\bcitibank\b|\bciti\s+bank\b/i,  'citibank'],
  [/\bmaybank\b|malayan banking/i,   'maybank'],
]

function detectSource(rawText: string): StatementSource {
  const sample = rawText.slice(0, 2000)
  for (const [re, src] of BANK_HINTS) {
    if (re.test(sample)) return src
  }
  return 'generic'
}

// ---------------------------------------------------------------------------
// Account number extraction from pre-header metadata rows
// ---------------------------------------------------------------------------

const ACCOUNT_RE = /account\s*(?:no|number|num|#)?\s*[:\s]+([A-Z0-9][\w-]{4,19})/i

function extractAccountNo(preHeaderRows: string[][]): string {
  for (const row of preHeaderRows) {
    const line = row.join(' ')
    const m = line.match(ACCOUNT_RE)
    if (m?.[1]) return m[1].trim()
  }
  return 'UNKNOWN-ACCOUNT'
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export class GenericCsvParser implements StatementParser {
  detect(text: string): boolean {
    if (!text) return false
    const lines = text.trim().split('\n').filter(l => l.trim().length > 0)
    if (lines.length < 2) return false
    // Count lines that contain commas — metadata rows may not have them,
    // but a valid CSV must have at least 2 comma-separated lines
    const csvLines = lines.slice(0, 15).filter(l => l.includes(','))
    return csvLines.length >= 2
  }

  parse(text: string): Statement {
    if (!this.detect(text)) {
      throw new ParseError('Not a valid CSV file', 'generic')
    }

    const { data, errors } = Papa.parse<string[]>(text, { skipEmptyLines: true })

    if (errors.length > 0) {
      throw new ParseError(`CSV parse error: ${errors[0]?.message}`, 'generic')
    }

    if (data.length < 2) {
      throw new ParseError('CSV missing data rows', 'generic')
    }

    let dateIdx = -1
    let descIdx = -1
    let amtIdx = -1
    let withdrawalIdx = -1
    let depositIdx = -1
    let balIdx = -1

    let headerRowIdx = -1
    let firstDataRowIdx = -1

    // -----------------------------------------------------------------------
    // Phase 1: Scan first 15 rows for a recognisable header row
    // -----------------------------------------------------------------------
    for (let r = 0; r < Math.min(data.length, 15); r++) {
      const row = data[r]!
      if (row.length < 2) continue

      let d = -1, desc = -1, a = -1, w = -1, dep = -1, bal = -1

      for (let i = 0; i < row.length; i++) {
        const h = row[i]!.trim().toLowerCase()
        if (!h) continue

        if (d === -1 && (DATE_KEYWORDS.has(h) || h.includes('transaction date') || h.includes('posting date') || h.includes('txn date') || h.includes('trans date') || h.includes('entry date') || h.includes('trx date') || h.includes('trade date'))) d = i
        if (desc === -1 && (DESC_KEYWORDS.has(h) || NAME_EXACT.has(h))) desc = i
        if (a === -1 && (AMT_KEYWORDS.has(h) || h.includes('amount ('))) a = i
        if (w === -1 && (WDL_KEYWORDS.has(h) || h.includes('withdrawal') || h.includes('debit'))) w = i
        if (dep === -1 && (DEP_KEYWORDS.has(h) || h.includes('deposit') || h.includes('credit'))) dep = i
        if (bal === -1 && (BAL_KEYWORDS.has(h) || h.includes('balance'))) bal = i
      }

      // Require at minimum: a date column AND at least one amount/debit/credit column
      if (d !== -1 && (a !== -1 || w !== -1 || dep !== -1)) {
        headerRowIdx = r
        dateIdx = d
        descIdx = desc
        amtIdx = a
        withdrawalIdx = w
        depositIdx = dep
        balIdx = bal
        firstDataRowIdx = r + 1
        break
      }
    }

    // -----------------------------------------------------------------------
    // Phase 2: No header found — infer columns from data patterns
    // -----------------------------------------------------------------------
    if (headerRowIdx === -1) {
      for (let r = 0; r < Math.min(data.length, 15); r++) {
        const row = data[r]!
        if (row.length < 2) continue

        let d = -1, desc = -1, a = -1
        for (let i = 0; i < row.length; i++) {
          const val = row[i]?.trim() || ''
          const isDate = /^\d{2,4}[-/]\d{2}[-/]\d{2,4}(?:\s+\d{2}:\d{2}(:\d{2})?)?$/.test(val)
            || /^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/.test(val)
          const isNumber = /^[(]?[A-Z]{0,3}[+-]?\s*\d{1,3}(,?\d{3})*(\.\d{1,2})?[)]?$/.test(val) && val !== ''

          if (d === -1 && isDate) d = i
          else if (a === -1 && isNumber && !isDate) a = i
          else if (desc === -1 && isNaN(Number(val)) && val.length > 3 && !isDate) desc = i
        }

        if (d !== -1 && a !== -1) {
          dateIdx = d
          descIdx = desc
          amtIdx = a
          firstDataRowIdx = r
          break
        }
      }
    }

    if (dateIdx === -1 || (amtIdx === -1 && withdrawalIdx === -1 && depositIdx === -1)) {
      throw new ParseError('Could not identify essential transaction columns (Date/Amount)', 'generic')
    }

    // -----------------------------------------------------------------------
    // Fallback: pick a description column if still missing
    // -----------------------------------------------------------------------
    if (descIdx === -1 && firstDataRowIdx !== -1) {
      const firstRow = data[firstDataRowIdx]!
      const excluded = new Set([dateIdx, amtIdx, withdrawalIdx, depositIdx, balIdx].filter(i => i !== -1))

      // Prefer a column whose first data value looks like text (>5 chars, not purely numeric)
      for (let i = 0; i < firstRow.length; i++) {
        if (excluded.has(i)) continue
        const val = firstRow[i]?.trim() || ''
        if (val.length > 5 && isNaN(Number(val.replace(/,/g, '')))) {
          descIdx = i; break
        }
      }
      // Last resort: any non-essential column
      if (descIdx === -1) {
        for (let i = 0; i < firstRow.length; i++) {
          if (!excluded.has(i)) { descIdx = i; break }
        }
      }
    }

    // -----------------------------------------------------------------------
    // Bank source & account number from metadata rows before the header
    // -----------------------------------------------------------------------
    const source = detectSource(text)
    const preHeaderRows = headerRowIdx > 0 ? (data.slice(0, headerRowIdx) as string[][]) : []
    const accountNo = extractAccountNo(preHeaderRows)

    // -----------------------------------------------------------------------
    // Build transactions
    // -----------------------------------------------------------------------
    const maxColNeeded = Math.max(
      dateIdx,
      amtIdx !== -1 ? amtIdx : 0,
      withdrawalIdx !== -1 ? withdrawalIdx : 0,
      depositIdx !== -1 ? depositIdx : 0,
    )

    const transactions: Transaction[] = []

    for (let i = firstDataRowIdx; i < data.length; i++) {
      const row = data[i]!

      // Skip whitespace-only rows
      if (row.every(cell => !cell.trim())) continue
      // Skip rows too short to contain all essential columns
      if (row.length <= maxColNeeded) continue

      const dateRaw = row[dateIdx]?.trim()
      if (!dateRaw) continue

      const date = normalizeDate(dateRaw)
      if (!date) continue

      const descRaw = (descIdx !== -1 ? (row[descIdx]?.trim() || 'Unknown') : 'Unknown')
        .replace(/[\r\n]+/g, ' ')

      let amtValue = 0
      let hasAmt = false

      if (amtIdx !== -1) {
        const parsed = parseAmount(row[amtIdx]?.trim() || '')
        if (parsed !== null) { amtValue = parsed; hasAmt = true }
      } else {
        const wStr = withdrawalIdx !== -1 ? row[withdrawalIdx]?.trim() || '' : ''
        const dStr = depositIdx !== -1 ? row[depositIdx]?.trim() || '' : ''

        if (wStr) {
          const wVal = parseAmount(wStr)
          if (wVal !== null) { amtValue = -Math.abs(wVal); hasAmt = true }
        } else if (dStr) {
          const dVal = parseAmount(dStr)
          if (dVal !== null) { amtValue = Math.abs(dVal); hasAmt = true }
        }
      }

      if (!hasAmt) continue

      const tx: Transaction = { date, description: descRaw, transactionValue: amtValue }

      if (balIdx !== -1) {
        const bal = parseAmount(row[balIdx]?.trim() || '')
        if (bal !== null) tx.balance = bal
      }

      transactions.push(tx)
    }

    if (transactions.length === 0) {
      throw new ParseError('No valid transactions found', 'generic')
    }

    return {
      source,
      statementType: 'debit',
      accountNo,
      transactions,
    }
  }
}
