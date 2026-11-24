import { db } from '../db/db'
import { evaluateRules } from './evaluateRules'

/** Applies category rules in priority order, skipping manual categories. */
export async function applyRulesToImport(transactionIds: string[]): Promise<void> {
  if (!transactionIds.length) return

  await db.transaction('rw', db.rules, db.transactions, async () => {
    const rules = await db.rules.orderBy('priority').toArray()
    const transactions = await db.transactions.bulkGet(transactionIds)
    const updates: { key: string; changes: { category: string | undefined } }[] = []

    for (const transaction of transactions) {
      if (!transaction || transaction.manualCategory) continue

      const category = evaluateRules(transaction, rules)
      if (category) {
        if (category !== transaction.category) updates.push({ key: transaction.id, changes: { category } })
      } else if (transaction.transactionValue > 0 && transaction.category === 'cat_income') {
        // Older versions labeled every unmatched credit as Income.
        updates.push({ key: transaction.id, changes: { category: undefined } })
      }
    }

    if (updates.length) await db.transactions.bulkUpdate(updates)
  })
}
