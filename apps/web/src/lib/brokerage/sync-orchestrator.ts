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
  BrokerageFundDetail,
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
  /** Append fund details (never overwrite) */
  appendFundDetails(actions: BrokerageFundDetail[]): Promise<void>
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
  transactions: 600, // High tier: 120/min → 600ms
  account: 1100, // Medium tier: 60/min → ~1.1s
  fund_details: 6100, // Low tier: 10/min → 6.1s between requests
}

/**
 * Maximum number of retries per API call (1 retry = 2 total attempts per the spec).
 */
const MAX_RETRIES = 1

/**
 * Base delay for exponential backoff (ms).
 */
const BASE_BACKOFF_MS = 1000

/**
 * Create a progress callback that forwards provider-level messages
 * to the orchestrator's onProgress callback.
 */
function makeProgress(
  onProgress: ((progress: SyncProgress) => void) | undefined,
  category: SyncCategory
): (message: string) => void {
  return (message: string) => {
    onProgress?.({
      category,
      completed: 0,
      total: 0,
      completedAt: new Date().toISOString(),
      message,
    })
  }
}

export interface SyncOrchestratorOptions {
  provider: BrokerageProvider
  database: SyncDatabase
  /** Transaction/corp action lookback window (days). Default: 90 */
  lookbackDays?: number
  /** Called after each category completes with progress info */
  onProgress?: (progress: SyncProgress) => void
}

/** Progress event emitted by the orchestrator during sync */
export interface SyncProgress {
  category: SyncCategory
  completed: number
  total: number
  /** ISO timestamp when this event was emitted */
  completedAt: string
  /** Error message if this category failed, undefined on success */
  error?: string
  /** Sub-category progress message (e.g. pagination status) */
  message?: string
}

export class SyncOrchestrator {
  private provider: BrokerageProvider
  private db: SyncDatabase
  private lookbackDays: number
  private onProgress?: (progress: SyncProgress) => void

  // Track the last request timestamp per category for basic rate limiting
  private lastRequestTime: Map<SyncCategory, number> = new Map()

  constructor(options: SyncOrchestratorOptions) {
    this.provider = options.provider
    this.db = options.database
    this.lookbackDays = options.lookbackDays ?? 90
    this.onProgress = options.onProgress
  }

  /**
   * Sync all categories (or specified subset).
   * Categories fail independently — if one fails, others continue.
   */
  async sync(categories?: SyncCategory[]): Promise<void> {
    const toSync = categories ?? (['positions', 'transactions', 'fund_details', 'account'] as SyncCategory[])
    const since = new Date()
    since.setDate(since.getDate() - this.lookbackDays)

    let completed = 0
    const total = toSync.length

    // Execute categories sequentially to respect rate limits.
    // Each category is independently wrapped in error isolation.
    for (const category of toSync) {
      let error: string | undefined

      // Emit start-of-category progress
      this.onProgress?.({
        category,
        completed,
        total,
        completedAt: new Date().toISOString(),
      })

      try {
        await this.syncCategory(category, since)
      } catch (err) {
        // Error already logged in syncCategory. Continue to next category.
        console.error(`[SyncOrchestrator] Category "${category}" failed, continuing:`, err)
        error = err instanceof Error ? err.message : String(err)
      } finally {
        completed++
        this.onProgress?.({
          category,
          completed,
          total,
          completedAt: new Date().toISOString(),
          error,
        })
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
      fund_details: { lastSyncAt: null, status: null },
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
        case 'fund_details':
          await this.syncFundDetailsWithRetry(since)
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
      const positions = await this.provider.fetchPositions(makeProgress(this.onProgress, 'positions'))
      await this.db.upsertPositions(positions)
    })
  }

  private async syncTransactionsWithRetry(since: Date): Promise<void> {
    await this.withRetry(async () => {
      const transactions = await this.provider.fetchTransactions(since, makeProgress(this.onProgress, 'transactions'))
      if (transactions.length > 0) {
        await this.db.appendTransactions(transactions)
      }
    })
  }

  private async syncFundDetailsWithRetry(since: Date): Promise<void> {
    await this.withRetry(async () => {
      const fundDetails = await this.provider.fetchFundDetails(since, makeProgress(this.onProgress, 'fund_details'))
      if (fundDetails.length > 0) {
        await this.db.appendFundDetails(fundDetails)
      }
    })
  }

  private async syncAccountWithRetry(): Promise<void> {
    await this.withRetry(async () => {
      const accounts = await this.provider.fetchAccount(makeProgress(this.onProgress, 'account'))
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
