import type {
  BrokerageKlineBar,
  BrokeragePosition,
  BrokerageProvider,
  BrokerageSyncLog,
  BrokerageTransaction,
} from '@lokfi/brokerage-core'
import { describe, expect, it, vi } from 'vitest'
import { type SyncDatabase, SyncOrchestrator, computeIncrementalSince } from './sync-orchestrator'

// ── Mock Provider ─────────────────────────────────────────────────────────────

function createMockProvider(overrides?: Partial<BrokerageProvider>): BrokerageProvider {
  return {
    source: 'mock',
    displayName: 'Mock Broker',
    fetchPositions: vi.fn().mockResolvedValue([]),
    fetchTransactions: vi.fn().mockResolvedValue([]),
    fetchFundDetails: vi.fn().mockResolvedValue([]),
    fetchAccount: vi.fn().mockResolvedValue([]),
    fetchHistoricalBars: vi.fn().mockResolvedValue([] as BrokerageKlineBar[]),
    validateConnection: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

// ── Mock SyncDatabase ─────────────────────────────────────────────────────────

function createMockDatabase(): SyncDatabase {
  const logs: BrokerageSyncLog[] = []
  return {
    upsertPositions: vi.fn().mockResolvedValue(undefined),
    upsertPositionExtensions: vi.fn().mockResolvedValue(undefined),
    appendTransactions: vi.fn().mockResolvedValue(undefined),
    appendFundDetails: vi.fn().mockResolvedValue(undefined),
    upsertAccounts: vi.fn().mockResolvedValue(undefined),
    insertSyncLog: vi.fn().mockImplementation((log: BrokerageSyncLog) => {
      logs.push(log)
      return Promise.resolve()
    }),
    getSyncLogs: vi.fn().mockImplementation(() => Promise.resolve([...logs])),
  }
}

// ── Test Data ─────────────────────────────────────────────────────────────────

const mockPosition: BrokeragePosition = {
  id: 'AAPL_mock',
  source: 'mock',
  symbol: 'AAPL',
  currency: 'USD',
  quantity: 100,
  avgCost: 150,
  updatedAt: '2025-01-01T00:00:00.000Z',
}

const mockTransaction: BrokerageTransaction = {
  id: 'mock_123',
  source: 'mock',
  orderId: '123',
  symbol: 'AAPL',
  action: 'BUY',
  quantity: 100,
  price: 150,
  currency: 'USD',
  executedAt: '2025-01-01T10:00:00.000Z',
}

describe('SyncOrchestrator', () => {
  describe('sync() defaults', () => {
    it('sync() defaults to all 4 categories', async () => {
      const provider = createMockProvider()
      const db = createMockDatabase()
      const orchestrator = new SyncOrchestrator({ provider, database: db })

      await orchestrator.sync()

      // All four categories should have been attempted
      const logCalls = vi.mocked(db.insertSyncLog).mock.calls
      const categories = logCalls.map((call) => (call[0] as BrokerageSyncLog).category)

      expect(categories).toContain('positions')
      expect(categories).toContain('transactions')
      expect(categories).toContain('fund_details')
      expect(categories).toContain('account')
    })
  })

  describe('sync() with specific categories', () => {
    it('sync() with specific categories only syncs those', async () => {
      const provider = createMockProvider({
        fetchPositions: vi.fn().mockResolvedValue([mockPosition]),
      })
      const db = createMockDatabase()
      const orchestrator = new SyncOrchestrator({ provider, database: db })

      await orchestrator.sync(['positions'])

      const logCalls = vi.mocked(db.insertSyncLog).mock.calls
      const categories = logCalls.map((call) => (call[0] as BrokerageSyncLog).category)

      expect(categories).toContain('positions')
      expect(categories).not.toContain('transactions')
      expect(categories).not.toContain('fund_details')
      expect(categories).not.toContain('account')
    })
  })

  describe('sync() with since parameter', () => {
    it('sync() passes since date to fetchTransactions and fetchFundDetails', async () => {
      const provider = createMockProvider()
      const db = createMockDatabase()
      const orchestrator = new SyncOrchestrator({ provider, database: db })

      const since = new Date('2025-01-01')
      await orchestrator.sync(['transactions', 'fund_details'], since)

      expect(provider.fetchTransactions).toHaveBeenCalledWith(since, expect.anything())
      expect(provider.fetchFundDetails).toHaveBeenCalledWith(since, expect.anything())
    })

    it('sync() uses categoryOverrides per-category when provided', async () => {
      const provider = createMockProvider()
      const db = createMockDatabase()
      const orchestrator = new SyncOrchestrator({ provider, database: db })

      const sharedSince = new Date('2025-01-01')
      const fundDetailsSince = new Date('2024-06-01')
      const overrides = { fund_details: fundDetailsSince } as const

      await orchestrator.sync(['transactions', 'fund_details'], sharedSince, overrides)

      // Transactions should use the shared since
      expect(provider.fetchTransactions).toHaveBeenCalledWith(sharedSince, expect.anything())
      // Fund details should use the override (wider window)
      expect(provider.fetchFundDetails).toHaveBeenCalledWith(fundDetailsSince, expect.anything())
    })

    it('sync() defaults to all-time (3650 days) when no since is given', async () => {
      const provider = createMockProvider({
        fetchTransactions: vi.fn().mockImplementation(() => {
          return Promise.resolve([])
        }),
      })
      const db = createMockDatabase()
      const orchestrator = new SyncOrchestrator({ provider, database: db })

      await orchestrator.sync(['transactions'])

      const calledSince = vi.mocked(provider.fetchTransactions).mock.calls[0][0] as Date
      const expectedMin = new Date()
      expectedMin.setDate(expectedMin.getDate() - 3660) // generous window
      expect(calledSince.getTime()).toBeGreaterThan(expectedMin.getTime())
    })
  })

  describe('computeIncrementalSince()', () => {
    it('returns undefined when no sync logs exist', async () => {
      const db = createMockDatabase()
      const result = await computeIncrementalSince(db, 'mock')
      expect(result).toBeUndefined()
    })

    it('returns a since date 14 days before the latest successful sync when all categories synced', async () => {
      const db = createMockDatabase()
      const syncTime = new Date('2025-06-01T12:00:00.000Z')
      // All 4 categories must have a sync log — otherwise unsynced
      // categories pull the minSince back to now - 3650 days.
      for (const cat of ['positions', 'transactions', 'fund_details', 'account'] as const) {
        await db.insertSyncLog({
          source: 'mock',
          category: cat,
          status: 'success',
          lastSyncAt: syncTime.toISOString(),
        })
      }

      const result = await computeIncrementalSince(db, 'mock')
      expect(result).toBeInstanceOf(Date)
      // Result should be syncTime minus 14 days in local timezone
      const expected = new Date(syncTime)
      expected.setDate(expected.getDate() - 14)
      expect(result!.getFullYear()).toBe(expected.getFullYear())
      expect(result!.getMonth()).toBe(expected.getMonth())
      expect(result!.getDate()).toBe(expected.getDate())
    })

    it('clamps never-synced categories to maxLookbackDays', async () => {
      const db = createMockDatabase()
      // One category synced, the rest never — without a clamp the unsynced
      // categories would pull the result back to now - 3650 days.
      await db.insertSyncLog({
        source: 'mock',
        category: 'positions',
        status: 'success',
        lastSyncAt: new Date().toISOString(),
      })

      const result = await computeIncrementalSince(db, 'mock', 180)
      expect(result).toBeInstanceOf(Date)
      const floor = new Date()
      floor.setDate(floor.getDate() - 181)
      expect(result!.getTime()).toBeGreaterThan(floor.getTime())
    })

    it('does not clamp recent incremental syncs', async () => {
      const db = createMockDatabase()
      const syncTime = new Date()
      syncTime.setDate(syncTime.getDate() - 3)
      for (const cat of ['positions', 'transactions', 'fund_details', 'account'] as const) {
        await db.insertSyncLog({
          source: 'mock',
          category: cat,
          status: 'success',
          lastSyncAt: syncTime.toISOString(),
        })
      }

      // Incremental result (last sync − 14d ≈ 17 days ago) is well within
      // the 180-day clamp and must come through unchanged.
      const result = await computeIncrementalSince(db, 'mock', 180)
      const expected = new Date(syncTime)
      expected.setDate(expected.getDate() - 14)
      expect(result!.getDate()).toBe(expected.getDate())
    })

    it('does not advance the checkpoint past a failed sync', async () => {
      const db = createMockDatabase()
      const oldSuccess = new Date()
      oldSuccess.setDate(oldSuccess.getDate() - 30)
      for (const cat of ['positions', 'transactions', 'fund_details', 'account'] as const) {
        await db.insertSyncLog({
          source: 'mock',
          category: cat,
          status: 'success',
          lastSyncAt: oldSuccess.toISOString(),
        })
      }
      // A later failed transactions sync must not move the checkpoint —
      // the failed window gets re-covered on the next sync.
      await db.insertSyncLog({
        source: 'mock',
        category: 'transactions',
        status: 'failure',
        lastSyncAt: new Date().toISOString(),
        errorMessage: 'network error mid-backfill',
      })

      const result = await computeIncrementalSince(db, 'mock')
      const expected = new Date(oldSuccess)
      expected.setDate(expected.getDate() - 14)
      expect(result!.getDate()).toBe(expected.getDate())
      expect(result!.getMonth()).toBe(expected.getMonth())
    })

    it('sync() default lookback respects the provider maxLookbackDays', async () => {
      const provider = createMockProvider({ maxLookbackDays: 180 } as Partial<BrokerageProvider>)
      const db = createMockDatabase()
      const orchestrator = new SyncOrchestrator({ provider, database: db })

      await orchestrator.sync(['transactions'])

      const calledSince = vi.mocked(provider.fetchTransactions).mock.calls[0][0] as Date
      const floor = new Date()
      floor.setDate(floor.getDate() - 181)
      expect(calledSince.getTime()).toBeGreaterThan(floor.getTime())
    })
  })

  describe('sync() fetches and persists data', () => {
    it('sync() fetches positions and upserts them', async () => {
      const provider = createMockProvider({
        fetchPositions: vi.fn().mockResolvedValue([mockPosition]),
      })
      const db = createMockDatabase()
      const orchestrator = new SyncOrchestrator({ provider, database: db })

      await orchestrator.sync(['positions'])

      expect(provider.fetchPositions).toHaveBeenCalled()
      expect(db.upsertPositions).toHaveBeenCalledWith([mockPosition])
    })
  })

  describe('sync() logging', () => {
    it('sync() logs success on completion', async () => {
      const provider = createMockProvider({
        fetchPositions: vi.fn().mockResolvedValue([mockPosition]),
      })
      const db = createMockDatabase()
      const orchestrator = new SyncOrchestrator({ provider, database: db })

      await orchestrator.sync(['positions'])

      const logCalls = vi.mocked(db.insertSyncLog).mock.calls
      const successLogs = logCalls.filter((call) => (call[0] as BrokerageSyncLog).status === 'success')

      expect(successLogs.length).toBeGreaterThan(0)
    })
  })

  describe('sync() error isolation', () => {
    it('sync() isolates errors — if positions succeed but transactions fail, positions still get upserted', async () => {
      const provider = createMockProvider({
        fetchPositions: vi.fn().mockResolvedValue([mockPosition]),
        fetchTransactions: vi.fn().mockRejectedValue(new Error('Network error')),
      })
      const db = createMockDatabase()
      const orchestrator = new SyncOrchestrator({ provider, database: db })

      // Should not throw
      await orchestrator.sync(['positions', 'transactions'])

      // Positions should have been upserted despite transaction failure
      expect(db.upsertPositions).toHaveBeenCalledWith([mockPosition])
    })

    it('sync() logs failure for failed categories', async () => {
      const provider = createMockProvider({
        fetchTransactions: vi.fn().mockRejectedValue(new Error('Network error')),
      })
      const db = createMockDatabase()
      const orchestrator = new SyncOrchestrator({ provider, database: db })

      await orchestrator.sync(['transactions'])

      const logCalls = vi.mocked(db.insertSyncLog).mock.calls
      const failureLogs = logCalls.filter((call) => (call[0] as BrokerageSyncLog).status === 'failure')

      expect(failureLogs.length).toBeGreaterThan(0)
    })
  })

  describe('sync() retry', () => {
    it('sync() retries failed requests once', async () => {
      let attempts = 0
      const provider = createMockProvider({
        fetchPositions: vi.fn().mockImplementation(() => {
          attempts++
          if (attempts === 1) {
            return Promise.reject(new Error('Transient error'))
          }
          return Promise.resolve([mockPosition])
        }),
      })
      const db = createMockDatabase()
      const orchestrator = new SyncOrchestrator({ provider, database: db })

      await orchestrator.sync(['positions'])

      expect(provider.fetchPositions).toHaveBeenCalledTimes(2)
      expect(db.upsertPositions).toHaveBeenCalledWith([mockPosition])
    })

    it('sync() retries with delay when using fake timers', async () => {
      vi.useFakeTimers()
      try {
        let attempts = 0
        const provider = createMockProvider({
          fetchPositions: vi.fn().mockImplementation(() => {
            attempts++
            if (attempts === 1) {
              // Advance time to pass the throttle before rejecting
              vi.advanceTimersByTime(1100)
              return Promise.reject(new Error('Transient error'))
            }
            return Promise.resolve([mockPosition])
          }),
        })
        // Reset Date.now for consistent throttle behavior
        vi.setSystemTime(0)
        const db = createMockDatabase()
        const orchestrator = new SyncOrchestrator({ provider, database: db })

        const syncPromise = orchestrator.sync(['positions'])

        // Advance past throttle + retry delay
        await vi.advanceTimersByTimeAsync(5000)

        await syncPromise

        expect(provider.fetchPositions).toHaveBeenCalledTimes(2)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('getSyncStatus()', () => {
    it('getSyncStatus() returns null for never-synced categories', async () => {
      const provider = createMockProvider()
      const db = createMockDatabase()
      const orchestrator = new SyncOrchestrator({ provider, database: db })

      const status = await orchestrator.getSyncStatus()

      expect(status.positions.lastSyncAt).toBeNull()
      expect(status.positions.status).toBeNull()
      expect(status.transactions.lastSyncAt).toBeNull()
      expect(status.transactions.status).toBeNull()
    })

    it('getSyncStatus() returns last sync timestamps and status', async () => {
      const provider = createMockProvider({
        fetchPositions: vi.fn().mockResolvedValue([mockPosition]),
      })
      const db = createMockDatabase()
      const orchestrator = new SyncOrchestrator({ provider, database: db })

      await orchestrator.sync(['positions'])

      const status = await orchestrator.getSyncStatus()

      expect(status.positions.lastSyncAt).not.toBeNull()
      expect(status.positions.status).toBe('success')
    })
  })

  describe('sync() throttling', () => {
    it('sync() makes requests sequentially for same category (throttling)', async () => {
      const provider = createMockProvider({
        fetchPositions: vi.fn().mockResolvedValue([mockPosition]),
        fetchTransactions: vi.fn().mockResolvedValue([mockTransaction]),
      })
      const db = createMockDatabase()
      const orchestrator = new SyncOrchestrator({ provider, database: db })

      await orchestrator.sync(['positions', 'transactions'])

      // Both calls should have been made (order varies due to sequential execution)
      expect(provider.fetchPositions).toHaveBeenCalled()
      expect(provider.fetchTransactions).toHaveBeenCalled()
    })
  })
})
