import type { Transaction } from './types'

/**
 * Generates a stable unique hash for a transaction.
 */
export function generateTransactionHash(txn: Transaction, occurrenceIndex: number): string {
  const data = `${txn.date}|${txn.description}|${txn.transactionValue}|${occurrenceIndex}`
  // In Phase 2+ we can upgrade this to a proper SHA-256 if needed.
  // For now, this serves as a unique lookup key in Dexie.
  return data
}
