import type { Transaction } from './types'

/**
 * Generates a stable unique hash for a transaction.
 * Strategy: SHA-1 of date + description + transactionValue + occurrenceIndex.
 * SHA-1 is used for speed and brevity, as cryptographically secure hashing is not required for deduping.
 * In a real app, SHA-256 (WebCrypto) is preferred, but for simplicity and Node/Browser compatibility
 * without async await in simple util (if possible), we might use a simple hash or WebCrypto.
 * 
 * Update: Let's use a standard synchronous way or just a simple string concatenation for now if 
 * WebCrypto is overkill, but the requirement was "hash". 
 * 
 * Actually, let's use a simple deterministic string as the 'hash' for Phase 1 to avoid async complexity 
 * in the parser loop unless necessary. Or we use a fast non-crypto hash.
 * 
 * Decision: For Phase 1, the "hash" is just the deterministic ID string.
 */
export function generateTransactionHash(txn: Transaction, occurrenceIndex: number): string {
  const data = `${txn.date}|${txn.description}|${txn.transactionValue}|${occurrenceIndex}`
  // In Phase 2+ we can upgrade this to a proper SHA-256 if needed.
  // For now, this serves as a unique lookup key in Dexie.
  return data
}
