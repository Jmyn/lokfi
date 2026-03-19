/** Thrown when a parser fails to process statement text. */
export class ParseError extends Error {
  constructor(message: string, public readonly source?: string) {
    super(message)
    this.name = 'ParseError'
  }
}

export const PREDEFINED_SOURCES = ['generic', 'ocbc', 'dbs', 'uob', 'citibank', 'cdc', 'maybank'] as const
export type StatementSource = string

export type StatementType = 'credit' | 'debit'

/** A single transaction from a bank statement. transactionValue is always in native (home) currency. */
export interface Transaction {
  date: string // ISO 8601 YYYY-MM-DD
  description: string
  transactionValue: number // negative = outflow, positive = inflow
  balance?: number // running balance — only present on debit statements that expose it
}

/** Transaction enriched with bank metadata and a dedup hash. */
export interface ConsolidatedTransaction extends Transaction {
  source: StatementSource
  accountNo: string
  hash: string
}

/**
 * Implemented by each bank parser.
 * For CSV-first phase, `text` is the raw CSV string.
 */
export interface StatementParser {
  detect(text: string): boolean // non-throwing, fast heuristic
  parse(text: string): Statement // throws ParseError on unexpected format
}

/** Output of a successful parse() call. */
export interface Statement {
  source: StatementSource
  statementType: StatementType
  accountNo: string
  transactions: Transaction[]
}

export interface DebitStatement extends Statement {
  statementType: 'debit'
}

export interface CreditStatement extends Statement {
  statementType: 'credit'
}

/** Column reference: either a 0-based index or a header string. */
export type ColumnRef = number | string

export interface CustomParserProfile {
  id: string
  name: string
  /** Fingerprint from computeHeaderFingerprint — used to auto-match future files. */
  headerFingerprint: string
  createdAt: string
  updatedAt: string

  columnMap: {
    date: ColumnRef
    description: ColumnRef
    /** Single combined amount column. Use this OR debit+credit. */
    amount?: ColumnRef
    /** Split columns: debit = outflow (stored negative), credit = inflow (stored positive). */
    debit?: ColumnRef
    credit?: ColumnRef
    balance?: ColumnRef
  }

  skipRows: number               // rows to skip before the header row (0-based)
  dateFormat?: string            // hint for non-standard date formats
  statementType: 'debit' | 'credit'
  accountNo?: string             // manual override
  negateAmount: boolean          // flip the sign of all parsed amounts
  source: StatementSource        // bank label shown on transactions
}
