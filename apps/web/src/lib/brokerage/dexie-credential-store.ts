/**
 * Dexie-backed CredentialStore adapter for CredentialManager.
 */

import type { BrokerageCredentials, BrokerageSource } from '@lokfi/brokerage-core'
import type { LokfiDatabase } from '../db/db'
import type { CredentialStore } from './credential-manager'

export class DexieCredentialStore implements CredentialStore {
  private db: LokfiDatabase

  constructor(db: LokfiDatabase) {
    this.db = db
  }

  async get(source: BrokerageSource): Promise<BrokerageCredentials | undefined> {
    return this.db.brokerageCredentials.get(source)
  }

  async put(record: BrokerageCredentials): Promise<void> {
    await this.db.brokerageCredentials.put(record)
  }

  async delete(source: BrokerageSource): Promise<void> {
    await this.db.brokerageCredentials.delete(source)
  }
}
