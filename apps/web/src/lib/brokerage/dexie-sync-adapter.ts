/**
 * Dexie-backed SyncDatabase adapter.
 *
 * Implements the SyncDatabase interface used by SyncOrchestrator,
 * translating calls into Dexie table operations on the brokerage_* stores.
 */

import type {
  BrokerageAccount,
  BrokerageFundDetail,
  BrokeragePosition,
  BrokeragePositionExtension,
  BrokerageSyncLog,
  BrokerageTransaction,
} from '@lokfi/brokerage-core'
import type { LokfiDatabase } from '../db/db'
import type { SyncDatabase } from './sync-orchestrator'

export class DexieSyncAdapter implements SyncDatabase {
  private db: LokfiDatabase

  constructor(db: LokfiDatabase) {
    this.db = db
  }

  async upsertPositions(positions: BrokeragePosition[]): Promise<void> {
    if (positions.length === 0) return
    const source = positions[0].source
    // Clear old positions for this source first so orphaned records from
    // previous ID formats (e.g. old `${symbol}_${source}` without secType)
    // don't linger alongside the new `${symbol}_${secType}_${source}` keys.
    // Note: source is not indexed on brokeragePositions, so use filter() instead of where()
    await this.db.brokeragePositions.filter((p) => p.source === source).delete()
    await this.db.brokeragePositions.bulkPut(positions)
  }

  async upsertPositionExtensions(extensions: BrokeragePositionExtension[]): Promise<void> {
    if (extensions.length === 0) return
    // Use composite key (positionId + key) for upsert
    const tx = this.db.brokeragePositionExtensions
    for (const ext of extensions) {
      await tx.put(ext)
    }
  }

  async appendTransactions(transactions: BrokerageTransaction[]): Promise<void> {
    if (transactions.length === 0) return

    // Content-based dedup: defend against the provider returning the same order
    // with different IDs across sync runs (e.g. from API pagination changes or
    // chunk-boundary straddling). Uses symbol + action + qty + price + date as
    // the natural business key for a trade fill.
    const contentKey = (t: BrokerageTransaction) =>
      `${t.source}|${t.symbol}|${t.secType ?? 'STK'}|${t.action}|${t.quantity}|${t.price}|${t.executedAt}`

    // Deduplicate within the incoming batch first
    const seen = new Set<string>()
    const deduped = transactions.filter((t) => {
      const key = contentKey(t)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Cross-check against existing records in the DB (streamed to avoid
    // loading the entire table into memory for large histories).
    const existingKeys = new Set<string>()
    await this.db.brokerageTransactions.each((t) => {
      existingKeys.add(contentKey(t))
    })
    const toInsert = deduped.filter((t) => !existingKeys.has(contentKey(t)))

    if (toInsert.length > 0) {
      await this.db.brokerageTransactions.bulkPut(toInsert)
    }
  }

  async appendFundDetails(actions: BrokerageFundDetail[]): Promise<void> {
    if (actions.length === 0) return

    const contentKey = (fd: BrokerageFundDetail) =>
      `${fd.source}|${fd.symbol ?? ''}|${fd.businessDate}|${fd.amount}|${fd.classifiedType}`

    // Deduplicate within the incoming batch (Tiger returns same trade per linked account)
    const seen = new Set<string>()
    const deduped = actions.filter((fd) => {
      const key = contentKey(fd)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Load existing records in the covered date range to detect cross-sync duplicates
    const dates = deduped.map((fd) => fd.businessDate).filter(Boolean) as string[]
    if (dates.length === 0) {
      await this.db.brokerageFundDetails.bulkPut(deduped)
      return
    }

    const minDate = dates.reduce((a, b) => (a < b ? a : b))
    const maxDate = dates.reduce((a, b) => (a > b ? a : b))
    const sourceSet = new Set(deduped.map((fd) => fd.source))

    const existing = await this.db.brokerageFundDetails
      .where('businessDate')
      .between(minDate, maxDate, true, true)
      .filter((fd) => sourceSet.has(fd.source))
      .toArray()

    const existingKeys = new Set(existing.map(contentKey))
    const toInsert = deduped.filter((fd) => !existingKeys.has(contentKey(fd)))

    if (toInsert.length > 0) {
      await this.db.brokerageFundDetails.bulkPut(toInsert)
    }
  }

  async upsertAccounts(accounts: BrokerageAccount[]): Promise<void> {
    await this.db.brokerageAccounts.bulkPut(accounts)
  }

  async insertSyncLog(log: BrokerageSyncLog): Promise<void> {
    await this.db.brokerageSyncLog.add(log)
  }

  async getSyncLogs(source: string): Promise<BrokerageSyncLog[]> {
    return this.db.brokerageSyncLog.where('source').equals(source).toArray()
  }
}
