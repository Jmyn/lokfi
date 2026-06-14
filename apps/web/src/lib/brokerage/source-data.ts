/**
 * Source-scoped brokerage data removal.
 *
 * Used by disconnect and full-resync flows so that clearing one
 * brokerage's data (e.g. Tiger) never wipes another's (e.g. Crypto.com).
 */

import type { LokfiDatabase } from '../db/db'

export async function clearBrokerageSourceData(db: LokfiDatabase, source: string): Promise<void> {
  // Position extensions carry no source column — resolve them via the
  // source's position ids before the positions are deleted.
  const positionIds = (await db.brokeragePositions.filter((p) => p.source === source).toArray()).map((p) => p.id)

  await db.brokerageTransactions.where('source').equals(source).delete()
  await db.brokerageFundDetails.where('source').equals(source).delete()
  await db.brokeragePositions.filter((p) => p.source === source).delete()
  if (positionIds.length > 0) {
    await db.brokeragePositionExtensions.where('positionId').anyOf(positionIds).delete()
  }
  await db.brokerageAccounts.where('source').equals(source).delete()
}
