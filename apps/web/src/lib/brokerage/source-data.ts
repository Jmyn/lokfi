/**
 * Source-scoped brokerage data removal.
 *
 * Used by disconnect and full-resync flows so that clearing one
 * brokerage's data (e.g. Tiger) never wipes another's (e.g. Crypto.com).
 */

import type { LokfiDatabase } from '../db/db'

export async function clearBrokerageSourceData(db: LokfiDatabase, source: string): Promise<void> {
  // Run as a single atomic transaction so a partial failure (or process
  // kill mid-clear) cannot leave orphaned extensions or accounts behind.
  // Position extensions carry no source column — resolve them via the
  // source's position ids before the positions are deleted.
  await db.transaction(
    'rw',
    [
      db.brokeragePositions,
      db.brokeragePositionExtensions,
      db.brokerageTransactions,
      db.brokerageFundDetails,
      db.brokerageAccounts,
    ],
    async () => {
      const positionIds = (await db.brokeragePositions.filter((p) => p.source === source).toArray()).map((p) => p.id)

      await db.brokerageTransactions.where('source').equals(source).delete()
      await db.brokerageFundDetails.where('source').equals(source).delete()
      await db.brokeragePositions.filter((p) => p.source === source).delete()
      if (positionIds.length > 0) {
        await db.brokeragePositionExtensions.where('positionId').anyOf(positionIds).delete()
      }
      await db.brokerageAccounts.where('source').equals(source).delete()
    }
  )
}
