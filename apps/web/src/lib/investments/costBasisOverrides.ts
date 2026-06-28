/**
 * Manual opening cost-basis overrides.
 *
 * Keyed by security identity (`getSecurityKey`, e.g. `CRYPTO:BTC`), durable
 * across syncs and full resyncs and included in backups. The cost-basis engine
 * uses the per-unit cost to price a holding's opening remainder, blending it
 * with synced trades.
 */

import type { OpeningCostOverrides } from '../brokerage/cdc/cdc-basis-enrichment'
import type { DbCostBasisOverride, LokfiDatabase } from '../db/db'

/** Get the override for a security, or null if none is set. */
export async function getCostBasisOverride(
  db: LokfiDatabase,
  securityKey: string
): Promise<DbCostBasisOverride | null> {
  return (await db.costBasisOverrides.get(securityKey)) ?? null
}

/** Set (or replace) the per-unit opening cost for a security. */
export async function setCostBasisOverride(
  db: LokfiDatabase,
  securityKey: string,
  unitCost: number,
  currency: string,
  updatedAt: string,
  note?: string
): Promise<void> {
  await db.costBasisOverrides.put({ securityKey, unitCost, currency, note, updatedAt })
}

/** Remove the override for a security (reverts the holding to the estimate). */
export async function clearCostBasisOverride(db: LokfiDatabase, securityKey: string): Promise<void> {
  await db.costBasisOverrides.delete(securityKey)
}

/** Load all overrides as a `securityKey → unitCost` map for the enrichment engine. */
export async function loadOpeningCostOverrides(db: LokfiDatabase): Promise<OpeningCostOverrides> {
  const rows = await db.costBasisOverrides.toArray()
  return new Map(rows.map((r) => [r.securityKey, r.unitCost]))
}
