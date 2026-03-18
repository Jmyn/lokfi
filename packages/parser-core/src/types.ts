/** Thrown when a parser fails to process statement text. */
export class ParseError extends Error {
  constructor(message: string, public readonly source?: string) {
    super(message)
    this.name = 'ParseError'
  }
}

export type StatementSource = 'ocbc' | 'dbs' | 'uob' | 'citibank' | 'cdc' | 'maybank' | 'generic'

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
