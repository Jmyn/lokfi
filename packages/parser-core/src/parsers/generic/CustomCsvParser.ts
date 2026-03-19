import Papa from 'papaparse'
import type { StatementParser, Statement, CustomParserProfile, ColumnRef } from '../../types'
import { ParseError } from '../../types'
import { parseAmount, normalizeDate, computeHeaderFingerprint } from './csvUtils'

function resolveIndex(headers: string[], ref: ColumnRef): number {
  if (typeof ref === 'number') return ref
  const lower = (ref as string).toLowerCase()
  return headers.findIndex(h => h.trim().toLowerCase() === lower)
}

export class CustomCsvParser implements StatementParser {
  constructor(private profile: CustomParserProfile) {}

  detect(text: string): boolean {
    if (!text) return false
    const { data } = Papa.parse<string[]>(text, { skipEmptyLines: false })
    const rows = (data as string[][]).filter(r => r.some(c => c.trim()))
    const headerRow = rows[this.profile.skipRows] ?? []
    const fingerprint = computeHeaderFingerprint([headerRow])
    return fingerprint === this.profile.headerFingerprint
  }

  parse(text: string): Statement {
    const { skipRows, columnMap, negateAmount, source, statementType, accountNo } = this.profile

    const { data, errors } = Papa.parse<string[]>(text, { skipEmptyLines: false })

    // Filter out non-fatal delimiter detection warnings
    const fatalErrors = errors.filter(e => e.type !== 'Delimiter')
    if (fatalErrors.length > 0) {
      throw new ParseError(`CSV parse error: ${fatalErrors[0]?.message}`, 'generic')
    }

    // Filter empty rows first, then apply skipRows — same logic as detect() and the modal preview
    const rows = (data as string[][]).filter(r => r.some(c => c.trim()))
    const headerRow = rows[skipRows] ?? []
    const headers = headerRow.map(h => h.trim().toLowerCase())
    const dataRows = rows.slice(skipRows + 1)

    const dateIdx = resolveIndex(headers, columnMap.date)
    const descIdx = resolveIndex(headers, columnMap.description)
    const amtIdx = columnMap.amount !== undefined ? resolveIndex(headers, columnMap.amount) : -1
    const debitIdx = columnMap.debit !== undefined ? resolveIndex(headers, columnMap.debit) : -1
    const creditIdx = columnMap.credit !== undefined ? resolveIndex(headers, columnMap.credit) : -1
    const balIdx = columnMap.balance !== undefined ? resolveIndex(headers, columnMap.balance) : -1

    if (dateIdx === -1) throw new ParseError('Date column not found', 'generic')
    if (amtIdx === -1 && debitIdx === -1 && creditIdx === -1) {
      throw new ParseError('Amount column not found', 'generic')
    }

    const transactions: Statement['transactions'] = []

    for (const row of dataRows) {
      if (row.every(c => !c.trim())) continue

      const dateRaw = row[dateIdx]?.trim()
      if (!dateRaw) continue
      const date = normalizeDate(dateRaw)
      if (!date) continue

      const description = (descIdx !== -1 ? row[descIdx]?.trim() || 'Unknown' : 'Unknown')
        .replace(/[\r\n]+/g, ' ')

      let transactionValue = 0
      let hasAmt = false

      if (amtIdx !== -1) {
        const parsed = parseAmount(row[amtIdx]?.trim() || '')
        if (parsed !== null) { transactionValue = parsed; hasAmt = true }
      } else {
        const wStr = debitIdx !== -1 ? row[debitIdx]?.trim() || '' : ''
        const dStr = creditIdx !== -1 ? row[creditIdx]?.trim() || '' : ''
        if (wStr) {
          const v = parseAmount(wStr)
          if (v !== null) { transactionValue = -Math.abs(v); hasAmt = true }
        } else if (dStr) {
          const v = parseAmount(dStr)
          if (v !== null) { transactionValue = Math.abs(v); hasAmt = true }
        }
      }

      if (!hasAmt) continue
      if (negateAmount) transactionValue = -transactionValue

      const txn: Statement['transactions'][number] = { date, description, transactionValue }
      if (balIdx !== -1) {
        const bal = parseAmount(row[balIdx]?.trim() || '')
        if (bal !== null) txn.balance = bal
      }
      transactions.push(txn)
    }

    if (transactions.length === 0) {
      throw new ParseError('No valid transactions found', 'generic')
    }

    return {
      source,
      statementType,
      accountNo: accountNo || 'UNKNOWN-ACCOUNT',
      transactions,
    }
  }
}
