/**
 * SyncOrchestrator — coordinates brokerage data sync with:
 *   - Per-category error isolation
 *   - Rate-limit-aware throttling (per API tier)
 *   - Retry with exponential backoff
 *   - Sync audit log (sync_log)
 *   - Staleness detection via getSyncStatus()
 */

import type {
  BrokerageAccount,
  BrokerageCorpAction,
  BrokeragePosition,
  BrokeragePositionExtension,
  BrokerageSyncLog,
  BrokerageTransaction,
  SyncCategory,
  SyncStatus,
} from '@lokfi/brokerage-core'
import type { BrokerageProvider } from '@lokfi/brokerage-core'

/** Database interface — abstracts Dexie for testability */
export interface SyncDatabase {
  /** Upsert positions (natural key: id) */
  upsertPositions(positions: BrokeragePosition[]): Promise<void>
  /** Upsert position extensions */
  upsertPositionExtensions(extensions: BrokeragePositionExtension[]): Promise<void>
  /** Append transactions (never overwrite) */
  appendTransactions(transactions: BrokerageTransaction[]): Promise<void>
  /** Append corporate actions (never overwrite) */
  appendCorpActions(actions: BrokerageCorpAction[]): Promise<void>
  /** Replace account records (one per source+currency) */
  upsertAccounts(accounts: BrokerageAccount[]): Promise<void>
  /** Insert sync log entry (auto-increment id) */
  insertSyncLog(log: BrokerageSyncLog): Promise<void>
  /** Query sync logs for staleness */
  getSyncLogs(source: string): Promise<BrokerageSyncLog[]>
}

/** Rate limit tiers matching Tiger OpenAPI documentation */
const RATE_LIMITS: Record<string, number> = {
  positions: 1100, // Medium tier: 60/min → ~1.1s between requests
  transactions: 600, // High tier: 120/min → 600ms (used more aggressively)
  account: 1100, // Medium tier
  corp_actions: 1100, // Medium tier
}

/**
 * Maximum number of retries per API call (1 retry = 2 total attempts per the spec).
 */
const MAX_RETRIES = 1

/**
 * Base delay for exponential backoff (ms).
 */
const BASE_BACKOFF_MS = 1000

export interface SyncOrchestratorOptions {
  provider: BrokerageProvider
  database: SyncDatabase
  /** Transaction/corp action lookback window (days). Default: 90 */
  lookbackDays?: number
}

export class SyncOrchestrator {
  private provider: BrokerageProvider
  private db: SyncDatabase
  private lookbackDays: number

  // Track the last request timestamp per category for basic rate limiting
  private lastRequestTime: Map<SyncCategory, number> = new Map()

  constructor(options: SyncOrchestratorOptions) {
    this.provider = options.provider
    this.db = options.database
    this.lookbackDays = options.lookbackDays ?? 90
  }

  /**
   * Sync all categories (or specified subset).
   * Categories fail independently — if one fails, others continue.
   */
  async sync(categories?: SyncCategory[]): Promise<void> {
    const toSync = categories ?? (['positions', 'transactions', 'corp_actions', 'account'] as SyncCategory[])
    const since = new Date()
    since.setDate(since.getDate() - this.lookbackDays)

    // Execute categories sequentially to respect rate limits.
    // Each category is independently wrapped in error isolation.
    for (const category of toSync) {
      try {
        await this.syncCategory(category, since)
      } catch (err) {
        // Error already logged in syncCategory. Continue to next category.
        console.error(`[SyncOrchestrator] Category "${category}" failed, continuing:`, err)
      }
    }
  }

  /**
   * Get staleness report per category.
   * Returns the last sync time and status for each category.
   */
  async getSyncStatus(): Promise<Record<SyncCategory, { lastSyncAt: string | null; status: SyncStatus | null }>> {
    const logs = await this.db.getSyncLogs(this.provider.source)
    const result: Record<SyncCategory, { lastSyncAt: string | null; status: SyncStatus | null }> = {
      positions: { lastSyncAt: null, status: null },
      transactions: { lastSyncAt: null, status: null },
      corp_actions: { lastSyncAt: null, status: null },
      account: { lastSyncAt: null, status: null },
    }

    for (const log of logs) {
      if (log.category in result) {
        result[log.category] = {
          lastSyncAt: log.lastSyncAt,
          status: log.status,
        }
      }
    }

    return result
  }

  // ── Private ────────────────────────────────────────────────────────────

  private async syncCategory(category: SyncCategory, since: Date): Promise<void> {
    // Log start
    const logEntry: BrokerageSyncLog = {
      source: this.provider.source,
      category,
      status: 'in_progress',
      lastSyncAt: new Date().toISOString(),
    }
    await this.db.insertSyncLog(logEntry)

    try {
      // Throttle
      await this.throttle(category)

      switch (category) {
        case 'positions':
          await this.syncPositionsWithRetry()
          break
        case 'transactions':
          await this.syncTransactionsWithRetry(since)
          break
        case 'corp_actions':
          await this.syncCorpActionsWithRetry(since)
          break
        case 'account':
          await this.syncAccountWithRetry()
          break
      }

      // Log success
      await this.db.insertSyncLog({
        source: this.provider.source,
        category,
        status: 'success',
        lastSyncAt: new Date().toISOString(),
      })
    } catch (err) {
      // Log failure
      const message = err instanceof Error ? err.message : String(err)
      await this.db.insertSyncLog({
        source: this.provider.source,
        category,
        status: 'failure',
        lastSyncAt: new Date().toISOString(),
        errorMessage: message,
      })
      throw err // Re-throw so outer loop can continue
    }
  }

  // ── Category sync methods with retry ────────────────────────────────────

  private async syncPositionsWithRetry(): Promise<void> {
    await this.withRetry(async () => {
      const positions = await this.provider.fetchPositions()
      await this.db.upsertPositions(positions)
    })
  }

  private async syncTransactionsWithRetry(since: Date): Promise<void> {
    await this.withRetry(async () => {
      const transactions = await this.provider.fetchTransactions(since)
      if (transactions.length > 0) {
        await this.db.appendTransactions(transactions)
      }
    })
  }

  private async syncCorpActionsWithRetry(since: Date): Promise<void> {
    await this.withRetry(async () => {
      const actions = await this.provider.fetchCorpActions(since)
      if (actions.length > 0) {
        await this.db.appendCorpActions(actions)
      }
    })
  }

  private async syncAccountWithRetry(): Promise<void> {
    await this.withRetry(async () => {
      const accounts = await this.provider.fetchAccount()
      await this.db.upsertAccounts(accounts)
    })
  }

  // ── Retry with exponential backoff ──────────────────────────────────────

  private async withRetry(fn: () => Promise<void>): Promise<void> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await fn()
        return
      } catch (err) {
        if (attempt === MAX_RETRIES) throw err
        const delay = BASE_BACKOFF_MS * 2 ** attempt
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  // ── Rate limiting ──────────────────────────────────────────────────────

  private async throttle(category: SyncCategory): Promise<void> {
    const minInterval = RATE_LIMITS[category] ?? 1000
    const lastTime = this.lastRequestTime.get(category) ?? 0
    const elapsed = Date.now() - lastTime
    const remaining = minInterval - elapsed

    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining))
    }

    this.lastRequestTime.set(category, Date.now())
  }
}
