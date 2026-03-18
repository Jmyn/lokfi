import { db } from '../db/db'
import { evaluateRules } from './evaluateRules'

/**
 * Applies the user's rule engine to a set of newly imported transactions.
 * Rules are evaluated in priority order (lowest number first).
 * The first matching rule applies its category.
 * If a transaction already has a `manualCategory`, it is skipped.
 * 
 * @param transactionIds Array of `DbTransaction.id`s that were just imported.
 * 
 * TODO: The call site for this should be inside `ImportPage.tsx` after
 * the `await db.transactions.bulkPut(records)` call in `handleImport()`.
 * E.g., `await applyRulesToImport(records.map(r => r.id))`
 */
export async function applyRulesToImport(transactionIds: string[]): Promise<void> {
  if (!transactionIds.length) return

  // Load all rules ordered by priority.
  // We use .toArray() to pull all rules into memory since we likely need to 
  // check many of them across the batch of transactions.
  const rules = await db.rules.orderBy('priority').toArray()
  
  // Optimization: If no rules exist, there's nothing to evaluate.
  if (rules.length === 0) return

  // Run updates in a single Dexie database transaction for performance and atomicity
  await db.transaction('rw', db.transactions, async () => {
    // We can fetch transactions in chunks if the array is large, 
    // but bulkGet is efficient for typical import sizes (~100s of txns).
    const txns = await db.transactions.bulkGet(transactionIds)

    const updates: { id: string; category: string }[] = []

    for (const txn of txns) {
      if (!txn) continue
      
      // Tier 1 precedence: Manual category always wins, so skip rule eval
      if (txn.manualCategory) continue

      // Tier 2 precedence: Evaluate general rules
      const matchedCategory = evaluateRules(txn, rules)
      
      if (matchedCategory) {
        updates.push({ id: txn.id, category: matchedCategory })
      }
    }

    // Apply any modifications we found
    // Using Dexie's bulkUpdate if supported, else mapping through put/update.
    // .bulkPut on existing records replaces the entire record, so we must 
    // fetch, modify and then bulkPut, or use parallel .update calls.
    // Given we just fetched them, let's modify and bulkPut.
    if (updates.length > 0) {
      // Create a map to apply updates easily
      const updateMap = new Map(updates.map(u => [u.id, u.category]))
      const updatedRecords = txns.filter((t): t is NonNullable<typeof t> => 
        t !== undefined && updateMap.has(t.id)
      ).map(t => ({
        ...t,
        category: updateMap.get(t.id)!
      }))

      await db.transactions.bulkPut(updatedRecords)
    }
  })
}
