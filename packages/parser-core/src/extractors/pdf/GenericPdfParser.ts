import { StatementParser, Statement, Transaction, ParseError } from '../../types'
import { normalizeOcrText } from './ocrNormalizer'
import { normalizeDate, parseAmount } from '../../parsers/generic/csvUtils'

/**
 * Generic PDF Statement Parser — fallback for unknown bank formats.
 *
 * Uses heuristics to detect and extract date+amount pairs from unstructured PDF text:
 * - Scans for date patterns per line
 * - Extracts amounts near the date or at line ends
 * - Classifies CR/DR from surrounding context keywords
 *
 * This is best-effort; balance extraction may be incomplete for generic PDFs.
 */

const DATE_PATTERNS = [
  // DD MMM YYYY (25 Dec 2025)
  /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})\b/i,
  // DD/MM/YYYY or MM/DD/YYYY
  /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/,
  // YYYY-MM-DD (ISO)
  /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/,
]

const AMOUNT_PATTERNS = [
  // $1,234.56 or 1,234.56
  /[$€£¥]?\s*[\d,]+\.\d{2}/g,
  // Parenthetical negatives: (1,234.56)
  /[(][\d,]+\.\d{2}[)]/g,
]


export class GenericPdfParser implements StatementParser {
  detect(text: string): boolean {
    if (!text) return false
    // Must have some date-like patterns and numeric content
    const hasDate = DATE_PATTERNS.some(re => re.test(text))
    const hasAmount = /\d{1,3}(,\d{3})*\.\d{2}/.test(text)
    return hasDate && hasAmount
  }

  parse(rawText: string): Statement {
    if (!this.detect(rawText)) {
      throw new ParseError('Not a recognized PDF format', 'generic-pdf')
    }

    const text = normalizeOcrText(rawText)
    const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0)

    const transactions: Transaction[] = []
    let i = 0

    while (i < lines.length) {
      const txn = this.tryParseLine(lines[i]!, lines[i + 1])
      if (txn) {
        transactions.push(txn)
        // Skip continuation lines
        if (lines[i + 1] && this.isContinuation(lines[i]!, lines[i + 1]!)) {
          i++
        }
      }
      i++
    }

    if (transactions.length === 0) {
      throw new ParseError('No transactions found in PDF', 'generic-pdf')
    }

    // Try to extract account number from any line
    const accountNo = this.extractAccountNo(lines)

    return {
      source: 'generic-pdf',
      statementType: 'credit',
      accountNo,
      transactions,
    }
  }

  private extractAccountNo(lines: string[]): string {
    for (const line of lines.slice(0, 30)) {
      const m = line.match(/account\s*(?:no|number|num|#)\s*[:\s]+([*\d-]{6,20})/i)
      if (m) return m[1]!.trim()
      // Masked card pattern
      const cardM = line.match(/\*{4}[-*]\*{4}[-*]\*{4}[-*]\d{4}/)
      if (cardM) return cardM[0]!.replace(/[-\s]/g, '')
    }
    return 'UNKNOWN-ACCOUNT'
  }

  private isContinuation(current: string, next: string): boolean {
    // A continuation line has no date but has text content
    const currentHasDate = DATE_PATTERNS.some(re => re.test(current))
    const nextHasDate = DATE_PATTERNS.some(re => re.test(next))
    return !nextHasDate && /\w{3,}/.test(next) && currentHasDate
  }

  private tryParseLine(line: string, nextLine?: string): Transaction | null {
    // Try each date pattern
    for (const dateRe of DATE_PATTERNS) {
      const match = line.match(dateRe)
      if (!match) continue

      const dateStr = normalizeDate(match[0]!)
      if (!dateStr) continue

      // Extract amounts from this line
      const amounts = this.extractAmounts(line)
      if (amounts.length === 0) continue

      // Determine transaction value and balance
      const { transactionValue, balance } = this.classifyAmounts(amounts, line)

      // Extract description: text before the first amount
      const firstAmountIdx = line.search(/\$?[\d,]+\.\d{2}|[(][\d,]+\.\d{2}[)]/)
      let description = 'Unknown'
      if (firstAmountIdx > 0) {
        description = line.slice(0, firstAmountIdx).trim()
      }

      // If description is empty/short and we have a next line, try that
      if (description.length < 3 && nextLine && !DATE_PATTERNS.some(re => re.test(nextLine))) {
        description = nextLine.trim().slice(0, 100)
      }

      description = description.replace(/[\r\n]+/g, ' ').trim() || 'Unknown'

      return { date: dateStr, description, transactionValue, ...(balance !== undefined && { balance }) }
    }

    return null
  }

  private extractAmounts(line: string): number[] {
    const amounts: number[] = []

    // Standard amounts
    for (const m of line.matchAll(/\$?([\d,]+\.\d{2})/g)) {
      const parsed = parseAmount(m[0]!)
      if (parsed !== null && parsed !== 0) amounts.push(parsed)
    }

    // Parenthetical negatives
    for (const m of line.matchAll(/[(]([\d,]+\.\d{2})[)]/g)) {
      const parsed = parseAmount(`(${m[1]})`)
      if (parsed !== null) amounts.push(parsed)
    }

    return amounts
  }

  private classifyAmounts(amounts: number[], line: string): { transactionValue: number; balance?: number } {
    const lowerLine = line.toLowerCase()

    const isCredit = /(\bcr\b|credit|inward)/i.test(lowerLine) && !/\bdr\b|debit\b/i.test(lowerLine)
    const isDebit = /(\bdr\b|debit|outward)/i.test(lowerLine) && !/\bcr\b|credit\b/i.test(lowerLine)

    // Filter out likely balance amounts (usually the largest or smallest depending on context)
    let txAmounts = amounts.filter(a => Math.abs(a) > 0.01)

    if (txAmounts.length === 0) {
      return { transactionValue: 0 }
    }

    let transactionValue: number
    let balance: number | undefined

    if (isCredit) {
      // Positive amounts = credits
      transactionValue = Math.max(...txAmounts)
    } else if (isDebit) {
      // Negative amounts = debits
      transactionValue = -Math.abs(Math.min(...txAmounts))
    } else {
      // Ambiguous: last amount is likely the transaction value
      // Earlier amounts might be balance
      if (txAmounts.length >= 2) {
        transactionValue = txAmounts[txAmounts.length - 1]!
        balance = txAmounts[0]
      } else {
        transactionValue = txAmounts[0]!
      }
    }

    return { transactionValue, ...(balance !== undefined && { balance }) }
  }
}
