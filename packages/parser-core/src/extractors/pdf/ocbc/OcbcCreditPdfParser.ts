import { StatementParser, Statement, Transaction, ParseError } from '../../../types'
import { normalizeOcrText } from '../ocrNormalizer'
import { parseAmount } from '../../../parsers/generic/csvUtils'

/**
 * OCBC Credit Card Statement PDF Parser.
 *
 * Detects OCBC credit card statements by scanning for:
 * - "OCBC" bank identifier
 * - "Credit Card" or "Card" label
 * - Card number pattern (masked or unmasked, dashes or spaces)
 *
 * Parses transactions from all card sections (main + supplementary),
 * handling SUBTOTAL separators between sections and stopping only at
 * "TOTAL AMOUNT DUE" (the true end of transaction data).
 *
 * Date format: DD/MM at the start of each transaction line.
 * Year is inferred from the statement date in the header (DD-MM-YYYY).
 */

/** OCBC credit card number: handles dashes, spaces, masked (****) or unmasked digits */
const CARD_NUMBER_RE = /(?:\d{4}|\*{4})[\s-](?:\d{4}|\*{4})[\s-](?:\d{4}|\*{4})[\s-]\d{4}/

/** Date pattern: DD/MM at start of a trimmed line (real OCBC PDF format) */
const DATE_RE = /^(\d{1,2})\/(\d{2})\b/

/** Amount: optional parens (negative), optional currency prefix, digits with decimals */
const AMOUNT_RE = /[(]?[$SGD]*\s*[\d,]+\.\d{2}[)]?/

export class OcbcCreditPdfParser implements StatementParser {
  detect(text: string): boolean {
    if (!text) return false
    const sample = text.slice(0, 3000).toLowerCase()
    // Must contain "ocbc" and either "credit card" or a masked card number
    const hasOcbc = /\bocbc\b/i.test(sample)
    const hasCreditCard = /credit\s*card/i.test(sample) || /\bcard\b/i.test(sample)
    const hasCardNumber = CARD_NUMBER_RE.test(sample)
    // Also check for common OCBC statement keywords
    const hasStatementKeyword = /statement|consolidated/i.test(sample)
    return hasOcbc && (hasCreditCard || hasCardNumber || hasStatementKeyword)
  }

  parse(rawText: string): Statement {
    if (!this.detect(rawText)) {
      throw new ParseError('Not an OCBC Credit Card statement', 'ocbc-credit')
    }

    const text = normalizeOcrText(rawText)
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)

    // Extract account/card number (primary card — first match in header)
    const accountNo = this.extractAccountNo(lines)
    // Infer statement year and month for DD/MM → YYYY-MM-DD conversion
    const stmtYear = this.extractStatementYear(lines)
    const stmtMonth = this.extractStatementMonth(lines)
    // Find transaction table start
    const tableStartIdx = this.findTableStart(lines)
    // Extract transactions across all card sections
    const transactions = this.parseTransactions(lines.slice(tableStartIdx), stmtYear, stmtMonth)

    if (transactions.length === 0) {
      throw new ParseError('No transactions found in OCBC statement', 'ocbc-credit')
    }

    return {
      source: 'ocbc-credit',
      statementType: 'credit',
      accountNo,
      transactions,
    }
  }

  private extractAccountNo(lines: string[]): string {
    // Scan all lines — on consolidated statements the primary card number can appear
    // after a long fine-print section (~line 29 in real OCBC PDFs).
    // Return the first card number found: that is the primary card.
    for (const line of lines) {
      const m = line.match(CARD_NUMBER_RE)
      if (m) return m[0]!.replace(/[-\s]/g, '')
    }
    // Fallback: look for Account No: pattern
    for (const line of lines) {
      const m = line.match(/account\s*(?:no|#|number)\s*[:\s]+([*\d-]{6,20})/i)
      if (m) return m[1]!.trim()
    }
    return 'UNKNOWN-ACCOUNT'
  }

  /**
   * Extracts the 4-digit year from the statement date line.
   * OCBC header format: "01-12-2025   24-12-2025   ..."
   */
  private extractStatementYear(lines: string[]): number {
    for (const line of lines.slice(0, 30)) {
      const m = line.match(/\b\d{2}-\d{2}-(\d{4})\b/)
      if (m) return parseInt(m[1]!, 10)
    }
    return new Date().getFullYear()
  }

  /**
   * Extracts the statement month (1–12) from the statement date line.
   * Used to infer year for cross-month transactions (e.g. Oct txns in Nov statement).
   */
  private extractStatementMonth(lines: string[]): number {
    for (const line of lines.slice(0, 30)) {
      const m = line.match(/\b\d{2}-(\d{2})-\d{4}\b/)
      if (m) return parseInt(m[1]!, 10)
    }
    return new Date().getMonth() + 1
  }

  /**
   * Finds the first transaction row by scanning for lines that match
   * the DD/MM date pattern and have numeric content (likely transaction data).
   */
  private findTableStart(lines: string[]): number {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      if (this.looksLikeTransactionLine(line)) {
        // Backtrack a bit in case we're mid-header
        const candidate = Math.max(0, i - 2)
        return candidate
      }
    }
    return 0
  }

  private looksLikeTransactionLine(line: string): boolean {
    // Transaction lines start with DD/MM date
    if (!DATE_RE.test(line)) return false
    // And must contain a decimal amount
    return AMOUNT_RE.test(line)
  }

  private parseTransactions(lines: string[], stmtYear: number, stmtMonth: number): Transaction[] {
    const transactions: Transaction[] = []
    let currentAccountNo: string | null = null
    let i = 0

    // Skip any header row within the table section
    while (i < lines.length) {
      const line = lines[i]!
      if (this.isHeaderLine(line)) { i++; continue }
      break
    }

    while (i < lines.length) {
      const line = lines[i]!

      // Stop at the true end of all transaction data
      if (this.isDocumentEnd(line)) break
      // Skip section separators (SUBTOTAL, per-card TOTAL) and keep scanning
      if (this.isSectionEnd(line)) { i++; continue }

      // Detect account switch: a line containing a card number starts a new card section
      const cardMatch = line.match(CARD_NUMBER_RE)
      if (cardMatch) {
        currentAccountNo = cardMatch[0]!.replace(/[-\s]/g, '')
        i++
        continue
      }

      const txn = this.tryParseTransactionLine(line, stmtYear, stmtMonth, lines[i + 1])
      if (txn) {
        // Stamp each transaction with the card it belongs to
        if (currentAccountNo) txn.accountNo = currentAccountNo
        transactions.push(txn)
        // If we consumed a second line, skip it
        const nextLine = lines[i + 1]
        if (nextLine && this.isContinuationLine(line, nextLine)) {
          i++
        }
      }
      i++
    }

    return transactions
  }

  private isHeaderLine(line: string): boolean {
    const lower = line.toLowerCase()
    return (
      /^(date|transaction|description|amount|debit|credit|balance|particulars)$/i.test(lower.trim()) ||
      lower.includes('posting date') ||
      lower.includes('transaction date') ||
      // OCBC-specific header patterns
      lower.includes('trans date') ||
      lower.includes(' particulars')
    )
  }

  /**
   * Signals the true end of all transaction data — triggers break.
   * Only "TOTAL AMOUNT DUE" is the final total; per-card "TOTAL" lines are section ends.
   */
  private isDocumentEnd(line: string): boolean {
    const lower = line.toLowerCase().trim()
    return (
      lower.includes('total amount due') ||
      lower.includes('balance brought') ||
      lower.includes('balance carried') ||
      lower.includes('minimum payment')
    )
  }

  /**
   * Signals the end of one card section — triggers continue (not break).
   * Covers both SUBTOTAL (within a card group) and TOTAL (end of card group).
   */
  private isSectionEnd(line: string): boolean {
    const lower = line.toLowerCase().trim()
    return (
      lower.includes('subtotal') ||
      /^total\b/i.test(lower)
    )
  }

  private isContinuationLine(current: string, next: string): boolean {
    // A continuation line doesn't start with a date, isn't a header/document-end,
    // and isn't a card number line (which would trigger an account switch on the next iteration).
    return !DATE_RE.test(next) && !this.isDocumentEnd(next) && !this.isHeaderLine(next) && !CARD_NUMBER_RE.test(next)
  }

  /**
   * Attempts to parse a single transaction line.
   * OCBC format: DD/MM DESCRIPTION [ORIGINAL_AMOUNT PLAN_REF] AMOUNT
   * Parenthesized amounts are credits/payments (negative on credit card statement).
   */
  private tryParseTransactionLine(
    line: string,
    stmtYear: number,
    stmtMonth: number,
    _nextLine?: string,
  ): Transaction | null {
    const dateMatch = line.match(DATE_RE)
    if (!dateMatch) return null

    const day = parseInt(dateMatch[1]!, 10)
    const month = parseInt(dateMatch[2]!, 10)
    if (day < 1 || day > 31 || month < 1 || month > 12) return null

    // Handle cross-year: if transaction month is after statement month, it's previous year
    // e.g. Jan statement with Dec transactions
    const year = month > stmtMonth ? stmtYear - 1 : stmtYear
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    // Detect parenthesized amounts (OCBC notation for credit/payment: "(907.84 )")
    const hasCreditParens = /\(\s*[\d,]+\.\d{2}\s*\)/.test(line)

    // Extract all decimal amounts from the line
    const rawAmounts = [...line.matchAll(/[\d,]+\.\d{2}/g)]
    if (rawAmounts.length === 0) return null

    const amounts = rawAmounts
      .map(m => parseAmount(m[0]!))
      .filter((n): n is number => n !== null && n !== 0)

    if (amounts.length === 0) return null

    // Last non-zero amount is the transaction value
    // (for instalment plans: original amount + ref + instalment amount → use last)
    const absValue = amounts[amounts.length - 1]!
    const transactionValue = hasCreditParens ? -Math.abs(absValue) : absValue

    // Extract description: text between date and first amount (or paren-amount)
    const afterDate = line.slice(dateMatch[0]!.length).trimStart()
    const firstAmountIdx = afterDate.search(/\(?\$?[\d,]+\.\d{2}/)
    let description: string
    if (firstAmountIdx !== -1) {
      description = afterDate.slice(0, firstAmountIdx).trim()
    } else {
      description = afterDate.replace(/CR|DR/gi, '').trim()
    }

    if (!description) description = 'Unknown'
    description = description.replace(/[\r\n]+/g, ' ').trim()

    return { date: dateStr, description, transactionValue }
  }
}
