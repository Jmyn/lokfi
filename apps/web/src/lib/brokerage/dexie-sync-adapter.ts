/**
 * Dexie-backed SyncDatabase adapter.
 *
 * Implements the SyncDatabase interface used by SyncOrchestrator,
 * translating calls into Dexie table operations on the brokerage_* stores.
 */

import type {
  BrokerageAccount,
  BrokerageCorpAction,
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
    // Use bulkPut with natural ID — if an orderId already exists, it won't
    // overwrite because the ID is based on orderId which is unique per fill.
    // New order fills (same orderId but different execution) would need
    // a separate mechanism — but the SDK's order transactions use unique IDs.
    await this.db.brokerageTransactions.bulkPut(transactions)
  }

  async appendCorpActions(actions: BrokerageCorpAction[]): Promise<void> {
    if (actions.length === 0) return
    await this.db.brokerageCorpActions.bulkPut(actions)
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
