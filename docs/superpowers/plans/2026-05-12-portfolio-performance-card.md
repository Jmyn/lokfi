# Portfolio Performance Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a snapshot-based portfolio performance card to the investments overview tab, with daily deduplicating snapshot capture on sync, an area chart with time-range filtering, return summary, and full backup/restore support.

**Architecture:** On every brokerage sync, `usePortfolioSnapshot` (a React hook) computes `totalValue` from live positions + accounts + FX rates and upserts a `portfolioSnapshots` row keyed by today's date. `PerformanceCard` queries snapshots, converts each to the current preferred currency via `convertAmount`, filters by selected range, and renders a Recharts `AreaChart` with a `+X.XX% / +CUR N` return summary.

**Tech Stack:** React, Dexie (IndexedDB), Recharts, Vitest

---

## File Map

| Action | File |
|---|---|
| Modify | `apps/web/src/lib/db/db.ts` |
| Modify | `apps/web/src/lib/db/backup.ts` |
| Modify | `apps/web/src/lib/db/backup.test.ts` |
| Create | `apps/web/src/lib/investments/portfolioPerformance.ts` |
| Create | `apps/web/src/lib/investments/portfolioPerformance.test.ts` |
| Create | `apps/web/src/lib/investments/usePortfolioSnapshot.ts` |
| Create | `apps/web/src/lib/investments/usePortfolioSnapshot.test.ts` |
| Modify | `apps/web/src/pages/investments/OverviewTab.tsx` |

---

## Task 1: Add `portfolioSnapshots` Dexie table (v10)

**Files:**
- Modify: `apps/web/src/lib/db/db.ts`

- [ ] **Step 1: Add `DbPortfolioSnapshot` interface and table property**

  In `apps/web/src/lib/db/db.ts`, add the interface after `DbBudget` (around line 67) and the table property inside `LokfiDatabase`:

  ```ts
  export interface DbPortfolioSnapshot {
    date: string       // YYYY-MM-DD, primary key
    totalValue: number
    currency: string   // preferred currency used at snapshot time
  }
  ```

  Add the table property after the `portfolioBucketAssignments` line:

  ```ts
  // Portfolio performance snapshots (v10)
  portfolioSnapshots!: Table<DbPortfolioSnapshot>
  ```

- [ ] **Step 2: Add Dexie v10 schema**

  After the `this.version(9)` block (around line 163), add:

  ```ts
  // v10 schema (adds daily portfolio value snapshots for performance chart)
  this.version(10).stores({
    portfolioSnapshots: 'date',
  })
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add apps/web/src/lib/db/db.ts
  git commit -m "feat(db): add portfolioSnapshots table (v10)"
  ```

---

## Task 2: Backup v5 — tests first, then implementation

**Files:**
- Modify: `apps/web/src/lib/db/backup.test.ts`
- Modify: `apps/web/src/lib/db/backup.ts`

- [ ] **Step 1: Write failing tests**

  Open `apps/web/src/lib/db/backup.test.ts`. The existing `baseV3` fixture and the `describe('backup helpers')` block are already there.

  First, **replace** the existing test `'uses backup version 4 for portfolio buckets'` with:
  ```ts
  it('uses backup version 5 for portfolio snapshots', () => {
    expect(BACKUP_VERSION).toBe(5)
  })
  ```

  Then add a `baseV4` fixture after `baseV3` and add four more new test cases at the end of the `describe` block:

  ```ts
  const baseV4 = {
    ...baseV3,
    version: 4,
    portfolioBuckets: [],
    portfolioBucketAssignments: [],
  }

  // — add inside describe('backup helpers') —

  it('requires portfolioSnapshots array for v5 backups', () => {
    expect(validateBackupShape({ ...baseV4, version: 5 }).valid).toBe(false)
    expect(
      validateBackupShape({ ...baseV4, version: 5, portfolioSnapshots: [] })
    ).toEqual({ valid: true })
  })

  it('normalizes v4 and older backups with empty portfolioSnapshots', () => {
    const normalizedV3 = normalizeBackupForImport(baseV3)
    expect(normalizedV3.portfolioSnapshots).toEqual([])

    const normalizedV4 = normalizeBackupForImport(baseV4)
    expect(normalizedV4.portfolioSnapshots).toEqual([])
  })

  it('keeps portfolioSnapshots during v5 normalization', () => {
    const snapshot = { date: '2026-05-01', totalValue: 10000, currency: 'SGD' }
    const normalized = normalizeBackupForImport({
      ...baseV4,
      version: 5,
      portfolioSnapshots: [snapshot],
    })
    expect(normalized.portfolioSnapshots).toHaveLength(1)
    expect(normalized.portfolioSnapshots[0]).toEqual(snapshot)
  })

  it('includes snapshot count in import summary', () => {
    const summary = buildImportSummary({
      ...normalizeBackupForImport({ ...baseV4, version: 5, portfolioSnapshots: [] }),
      portfolioSnapshots: [
        { date: '2026-05-01', totalValue: 10000, currency: 'SGD' },
        { date: '2026-05-02', totalValue: 10200, currency: 'SGD' },
      ],
    })
    expect(summary).toContain('2 portfolio snapshot(s)')
  })
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd apps/web && npx vitest run src/lib/db/backup.test.ts
  ```

  Expected: 4 new tests FAIL (BACKUP_VERSION still 4, v5 logic missing).

- [ ] **Step 3: Implement backup v5 changes in `apps/web/src/lib/db/backup.ts`**

  Replace the entire file with the following:

  ```ts
  import { createDefaultPortfolioBuckets } from '../investments/portfolioBuckets'
  import type { LokfiDatabase } from './db'

  export const BACKUP_VERSION = 5

  export interface LokfiBackup {
    version: 1 | 2 | 3 | 4 | 5
    exportedAt?: string
    transactions: unknown[]
    rules: unknown[]
    categories: unknown[]
    customParsers: unknown[]
    budgets: unknown[]
    brokeragePositions: unknown[]
    brokeragePositionExtensions: unknown[]
    brokerageTransactions: unknown[]
    brokerageFundDetails: unknown[]
    brokerageAccounts: unknown[]
    brokerageSyncLog: unknown[]
    brokerageCredentials: unknown[]
    portfolioBuckets: unknown[]
    portfolioBucketAssignments: unknown[]
    portfolioSnapshots: unknown[]
  }

  function isArray(value: unknown): value is unknown[] {
    return Array.isArray(value)
  }

  export function validateBackupShape(data: unknown): { valid: true } | { valid: false; message: string } {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { valid: false, message: 'Invalid backup file: expected an object.' }
    }
    const candidate = data as Record<string, unknown>
    const version = Number(candidate.version)
    if (![1, 2, 3, 4, 5].includes(version)) {
      return { valid: false, message: 'Invalid backup file: unsupported backup version.' }
    }
    for (const key of ['transactions', 'rules', 'categories', 'customParsers', 'budgets']) {
      if (!isArray(candidate[key])) {
        return { valid: false, message: `Invalid backup file: missing ${key} array.` }
      }
    }
    if (version >= 2) {
      for (const key of [
        'brokeragePositions',
        'brokeragePositionExtensions',
        'brokerageTransactions',
        'brokerageAccounts',
        'brokerageSyncLog',
        'brokerageCredentials',
      ]) {
        if (!isArray(candidate[key])) {
          return { valid: false, message: `Invalid brokerage backup file: missing ${key} array.` }
        }
      }
    }
    if (version >= 3 && !isArray(candidate.brokerageFundDetails)) {
      return { valid: false, message: 'Invalid v3 backup file: missing brokerageFundDetails array.' }
    }
    if (version >= 4) {
      if (!isArray(candidate.portfolioBuckets) || !isArray(candidate.portfolioBucketAssignments)) {
        return { valid: false, message: 'Invalid v4 backup file: missing portfolio bucket arrays.' }
      }
    }
    if (version >= 5 && !isArray(candidate.portfolioSnapshots)) {
      return { valid: false, message: 'Invalid v5 backup file: missing portfolioSnapshots array.' }
    }
    return { valid: true }
  }

  export function normalizeBackupForImport(data: Record<string, unknown>): LokfiBackup {
    const version = Number(data.version) as 1 | 2 | 3 | 4 | 5
    return {
      version,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : undefined,
      transactions: data.transactions as unknown[],
      rules: data.rules as unknown[],
      categories: data.categories as unknown[],
      customParsers: data.customParsers as unknown[],
      budgets: data.budgets as unknown[],
      brokeragePositions: version >= 2 ? (data.brokeragePositions as unknown[]) : [],
      brokeragePositionExtensions: version >= 2 ? (data.brokeragePositionExtensions as unknown[]) : [],
      brokerageTransactions: version >= 2 ? (data.brokerageTransactions as unknown[]) : [],
      brokerageFundDetails: version >= 3 ? (data.brokerageFundDetails as unknown[]) : [],
      brokerageAccounts: version >= 2 ? (data.brokerageAccounts as unknown[]) : [],
      brokerageSyncLog: version >= 2 ? (data.brokerageSyncLog as unknown[]) : [],
      brokerageCredentials: version >= 2 ? (data.brokerageCredentials as unknown[]) : [],
      portfolioBuckets: version >= 4 ? (data.portfolioBuckets as unknown[]) : [],
      portfolioBucketAssignments: version >= 4 ? (data.portfolioBucketAssignments as unknown[]) : [],
      portfolioSnapshots: version >= 5 ? (data.portfolioSnapshots as unknown[]) : [],
    }
  }

  export function buildImportSummary(data: LokfiBackup): string {
    return (
      `This will replace all current data with the backup:\n` +
      `• ${data.transactions.length} transaction(s)\n` +
      `• ${data.rules.length} rule(s)\n` +
      `• ${data.categories.length} categor(ies)\n` +
      `• ${data.customParsers.length} parser profile(s)\n` +
      `• ${data.budgets.length} budget(s)\n` +
      `• ${data.brokeragePositions.length} brokerage position(s)\n` +
      `• ${data.brokerageTransactions.length} brokerage trade(s)\n` +
      `• ${data.brokerageFundDetails.length} fund detail(s)\n` +
      `• ${data.brokerageAccounts.length} brokerage account(s)\n` +
      `• ${data.brokerageCredentials.length} credential(s) (encrypted)\n` +
      `• ${data.portfolioBuckets.length} portfolio bucket(s)\n` +
      `• ${data.portfolioBucketAssignments.length} portfolio bucket assignment(s)\n` +
      `• ${data.portfolioSnapshots.length} portfolio snapshot(s)\n` +
      `Current data will be overwritten. Are you sure?`
    )
  }

  export async function buildBackupPayload(db: LokfiDatabase): Promise<LokfiBackup & { exportedAt: string }> {
    const [
      transactions,
      rules,
      categories,
      customParsers,
      budgets,
      brokeragePositions,
      brokeragePositionExtensions,
      brokerageTransactions,
      brokerageFundDetails,
      brokerageAccounts,
      brokerageSyncLog,
      brokerageCredentials,
      portfolioBuckets,
      portfolioBucketAssignments,
      portfolioSnapshots,
    ] = await Promise.all([
      db.transactions.toArray(),
      db.rules.toArray(),
      db.categories.toArray(),
      db.customParsers.toArray(),
      db.budgets.toArray(),
      db.brokeragePositions.toArray(),
      db.brokeragePositionExtensions.toArray(),
      db.brokerageTransactions.toArray(),
      db.brokerageFundDetails.toArray(),
      db.brokerageAccounts.toArray(),
      db.brokerageSyncLog.toArray(),
      db.brokerageCredentials.toArray(),
      db.portfolioBuckets.toArray(),
      db.portfolioBucketAssignments.toArray(),
      db.portfolioSnapshots.toArray(),
    ])
    return {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      transactions,
      rules,
      categories,
      customParsers,
      budgets,
      brokeragePositions,
      brokeragePositionExtensions,
      brokerageTransactions,
      brokerageFundDetails,
      brokerageAccounts,
      brokerageSyncLog,
      brokerageCredentials,
      portfolioBuckets,
      portfolioBucketAssignments,
      portfolioSnapshots,
    }
  }

  export async function importBackupPayload(db: LokfiDatabase, data: LokfiBackup): Promise<void> {
    await db.transaction(
      'rw',
      [
        db.transactions,
        db.rules,
        db.categories,
        db.customParsers,
        db.budgets,
        db.brokeragePositions,
        db.brokeragePositionExtensions,
        db.brokerageTransactions,
        db.brokerageFundDetails,
        db.brokerageAccounts,
        db.brokerageSyncLog,
        db.brokerageCredentials,
        db.portfolioBuckets,
        db.portfolioBucketAssignments,
        db.portfolioSnapshots,
      ],
      async () => {
        await Promise.all([
          db.transactions.clear(),
          db.rules.clear(),
          db.categories.clear(),
          db.customParsers.clear(),
          db.budgets.clear(),
          db.brokeragePositions.clear(),
          db.brokeragePositionExtensions.clear(),
          db.brokerageTransactions.clear(),
          db.brokerageFundDetails.clear(),
          db.brokerageAccounts.clear(),
          db.brokerageSyncLog.clear(),
          db.brokerageCredentials.clear(),
          db.portfolioBuckets.clear(),
          db.portfolioBucketAssignments.clear(),
          db.portfolioSnapshots.clear(),
        ])
        if (data.transactions.length) await db.transactions.bulkAdd(data.transactions as never[])
        if (data.rules.length) await db.rules.bulkAdd(data.rules as never[])
        if (data.categories.length) await db.categories.bulkAdd(data.categories as never[])
        if (data.customParsers.length) await db.customParsers.bulkAdd(data.customParsers as never[])
        if (data.budgets.length) await db.budgets.bulkAdd(data.budgets as never[])
        if (data.brokeragePositions.length) await db.brokeragePositions.bulkAdd(data.brokeragePositions as never[])
        if (data.brokeragePositionExtensions.length) {
          await db.brokeragePositionExtensions.bulkAdd(data.brokeragePositionExtensions as never[])
        }
        if (data.brokerageTransactions.length)
          await db.brokerageTransactions.bulkAdd(data.brokerageTransactions as never[])
        if (data.brokerageFundDetails.length) await db.brokerageFundDetails.bulkAdd(data.brokerageFundDetails as never[])
        if (data.brokerageAccounts.length) await db.brokerageAccounts.bulkAdd(data.brokerageAccounts as never[])
        if (data.brokerageSyncLog.length) await db.brokerageSyncLog.bulkAdd(data.brokerageSyncLog as never[])
        if (data.brokerageCredentials.length) await db.brokerageCredentials.bulkAdd(data.brokerageCredentials as never[])
        const buckets = data.portfolioBuckets.length ? data.portfolioBuckets : createDefaultPortfolioBuckets()
        if (buckets.length) await db.portfolioBuckets.bulkAdd(buckets as never[])
        if (data.portfolioBucketAssignments.length) {
          await db.portfolioBucketAssignments.bulkAdd(data.portfolioBucketAssignments as never[])
        }
        if (data.portfolioSnapshots.length) await db.portfolioSnapshots.bulkAdd(data.portfolioSnapshots as never[])
      }
    )
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  cd apps/web && npx vitest run src/lib/db/backup.test.ts
  ```

  Expected: all tests PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/src/lib/db/backup.ts apps/web/src/lib/db/backup.test.ts
  git commit -m "feat(backup): bump to v5, add portfolioSnapshots to export/import"
  ```

---

## Task 3: Portfolio performance pure helpers

**Files:**
- Create: `apps/web/src/lib/investments/portfolioPerformance.ts`
- Create: `apps/web/src/lib/investments/portfolioPerformance.test.ts`

- [ ] **Step 1: Write failing tests**

  Create `apps/web/src/lib/investments/portfolioPerformance.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest'
  import { computeReturn, filterSnapshotsByRange } from './portfolioPerformance'

  const snap = (date: string, value: number) => ({ date, value })

  describe('filterSnapshotsByRange', () => {
    const snapshots = [
      snap('2025-05-12', 10000),
      snap('2025-08-12', 11000),
      snap('2025-11-12', 11500),
      snap('2026-02-12', 12000),
      snap('2026-05-11', 12500),
    ]
    const now = new Date('2026-05-12T00:00:00Z')

    it('returns all snapshots for All', () => {
      expect(filterSnapshotsByRange(snapshots, 'All', now)).toHaveLength(5)
    })

    it('filters to last 1 month', () => {
      const result = filterSnapshotsByRange(snapshots, '1M', now)
      expect(result.every((s) => s.date >= '2026-04-12')).toBe(true)
      expect(result).toHaveLength(1)
    })

    it('filters to last 3 months', () => {
      const result = filterSnapshotsByRange(snapshots, '3M', now)
      expect(result.every((s) => s.date >= '2026-02-12')).toBe(true)
      expect(result).toHaveLength(2)
    })

    it('filters to last 6 months', () => {
      const result = filterSnapshotsByRange(snapshots, '6M', now)
      expect(result.every((s) => s.date >= '2025-11-12')).toBe(true)
      expect(result).toHaveLength(3)
    })

    it('filters to last 12 months (1Y)', () => {
      const result = filterSnapshotsByRange(snapshots, '1Y', now)
      expect(result.every((s) => s.date >= '2025-05-12')).toBe(true)
      expect(result).toHaveLength(5)
    })

    it('filters YTD from Jan 1 of current year', () => {
      const result = filterSnapshotsByRange(snapshots, 'YTD', now)
      expect(result.every((s) => s.date >= '2026-01-01')).toBe(true)
      expect(result).toHaveLength(2)
    })
  })

  describe('computeReturn', () => {
    it('returns null for fewer than 2 points', () => {
      expect(computeReturn([])).toBeNull()
      expect(computeReturn([snap('2026-01-01', 10000)])).toBeNull()
    })

    it('returns null if first value is zero', () => {
      expect(computeReturn([snap('2026-01-01', 0), snap('2026-01-02', 100)])).toBeNull()
    })

    it('computes positive return', () => {
      const result = computeReturn([snap('2026-01-01', 10000), snap('2026-05-01', 11000)])
      expect(result).not.toBeNull()
      expect(result!.pct).toBeCloseTo(10, 5)
      expect(result!.abs).toBeCloseTo(1000, 5)
    })

    it('computes negative return', () => {
      const result = computeReturn([snap('2026-01-01', 10000), snap('2026-05-01', 9000)])
      expect(result!.pct).toBeCloseTo(-10, 5)
      expect(result!.abs).toBeCloseTo(-1000, 5)
    })

    it('uses first and last points only, ignoring middle values', () => {
      const result = computeReturn([
        snap('2026-01-01', 10000),
        snap('2026-03-01', 999999),
        snap('2026-05-01', 12000),
      ])
      expect(result!.pct).toBeCloseTo(20, 5)
      expect(result!.abs).toBeCloseTo(2000, 5)
    })
  })
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd apps/web && npx vitest run src/lib/investments/portfolioPerformance.test.ts
  ```

  Expected: all tests FAIL (module not found).

- [ ] **Step 3: Implement helpers**

  Create `apps/web/src/lib/investments/portfolioPerformance.ts`:

  ```ts
  export type RangeKey = '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'All'

  export interface SnapshotPoint {
    date: string  // YYYY-MM-DD
    value: number
  }

  export function filterSnapshotsByRange(
    snapshots: SnapshotPoint[],
    range: RangeKey,
    now: Date,
  ): SnapshotPoint[] {
    if (range === 'All') return [...snapshots]

    let cutoff: Date
    if (range === 'YTD') {
      cutoff = new Date(now.getFullYear(), 0, 1)
    } else {
      const monthsBack = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }[range]
      cutoff = new Date(now)
      cutoff.setMonth(cutoff.getMonth() - monthsBack)
    }

    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return snapshots.filter((s) => s.date >= cutoffStr)
  }

  export function computeReturn(points: SnapshotPoint[]): { pct: number; abs: number } | null {
    if (points.length < 2) return null
    const first = points[0].value
    const last = points[points.length - 1].value
    if (first === 0) return null
    return { pct: ((last - first) / first) * 100, abs: last - first }
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  cd apps/web && npx vitest run src/lib/investments/portfolioPerformance.test.ts
  ```

  Expected: all tests PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/src/lib/investments/portfolioPerformance.ts apps/web/src/lib/investments/portfolioPerformance.test.ts
  git commit -m "feat(investments): add portfolio performance helpers (filterSnapshotsByRange, computeReturn)"
  ```

---

## Task 4: `usePortfolioSnapshot` hook

**Files:**
- Create: `apps/web/src/lib/investments/usePortfolioSnapshot.ts`
- Create: `apps/web/src/lib/investments/usePortfolioSnapshot.test.ts`

- [ ] **Step 1: Write failing test for `computePortfolioTotalValue`**

  Create `apps/web/src/lib/investments/usePortfolioSnapshot.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest'
  import { computePortfolioTotalValue } from './usePortfolioSnapshot'
  import type { BrokerageAccount, BrokeragePosition } from '@lokfi/brokerage-core'

  const pos = (currency: string, marketValue: number): BrokeragePosition =>
    ({ currency, marketValue, quantity: 0, avgCost: 0 } as unknown as BrokeragePosition)

  const acc = (currency: string, cashBalance: number): BrokerageAccount =>
    ({ currency, cashBalance } as unknown as BrokerageAccount)

  const rates = { SGD: 1.35, USD: 1 }

  describe('computePortfolioTotalValue', () => {
    it('sums position market values without conversion when Original', () => {
      const result = computePortfolioTotalValue(
        [pos('USD', 1000), pos('SGD', 500)],
        [],
        'Original',
        rates,
      )
      expect(result).toBeCloseTo(1500, 5)
    })

    it('converts positions and accounts to preferred currency', () => {
      // 1000 USD → 1350 SGD, 500 SGD stays 500 SGD, 200 USD cash → 270 SGD
      const result = computePortfolioTotalValue(
        [pos('USD', 1000), pos('SGD', 500)],
        [acc('USD', 200)],
        'SGD',
        rates,
      )
      expect(result).toBeCloseTo(1000 * 1.35 + 500 + 200 * 1.35, 2)
    })

    it('falls back to quantity * avgCost when marketValue is null', () => {
      const position = { currency: 'USD', marketValue: null, quantity: 10, avgCost: 50 } as unknown as BrokeragePosition
      const result = computePortfolioTotalValue([position], [], 'Original', null)
      expect(result).toBeCloseTo(500, 5)
    })

    it('returns 0 for empty positions and accounts', () => {
      expect(computePortfolioTotalValue([], [], 'SGD', rates)).toBe(0)
    })
  })
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  cd apps/web && npx vitest run src/lib/investments/usePortfolioSnapshot.test.ts
  ```

  Expected: FAIL (module not found).

- [ ] **Step 3: Implement `computePortfolioTotalValue` and `usePortfolioSnapshot`**

  Create `apps/web/src/lib/investments/usePortfolioSnapshot.ts`:

  ```ts
  import type { BrokerageAccount, BrokeragePosition } from '@lokfi/brokerage-core'
  import { useLiveQuery } from 'dexie-react-hooks'
  import { useEffect } from 'react'
  import { convertAmount } from '../fx/convert'
  import { db } from '../db/db'
  import type { CurrencyOption } from '../../pages/investments/currencyPreference'

  export function computePortfolioTotalValue(
    positions: BrokeragePosition[],
    accounts: BrokerageAccount[],
    preferredCurrency: CurrencyOption,
    fxRates: Record<string, number> | null,
  ): number {
    const shouldConvert = preferredCurrency !== 'Original' && fxRates != null
    let sum = 0
    for (const p of positions) {
      const v = p.marketValue ?? p.quantity * p.avgCost
      sum += shouldConvert ? convertAmount(v, p.currency, preferredCurrency, fxRates) : v
    }
    for (const a of accounts) {
      sum += shouldConvert ? convertAmount(a.cashBalance, a.currency, preferredCurrency, fxRates) : a.cashBalance
    }
    return sum
  }

  export function usePortfolioSnapshot(
    preferredCurrency: CurrencyOption,
    fxRates: Record<string, number> | null,
  ): void {
    const positions = useLiveQuery(() => db.brokeragePositions.toArray(), [])
    const accounts = useLiveQuery(() => db.brokerageAccounts.toArray(), [])

    useEffect(() => {
      // Skip if data not loaded or currency is mixed-original (not comparable across currencies)
      if (!positions || !accounts || preferredCurrency === 'Original') return
      const totalValue = computePortfolioTotalValue(positions, accounts, preferredCurrency, fxRates)
      const date = new Date().toISOString().slice(0, 10)
      db.portfolioSnapshots.put({ date, totalValue, currency: preferredCurrency })
    }, [positions, accounts, preferredCurrency, fxRates])
  }
  ```

- [ ] **Step 4: Run test to confirm it passes**

  ```bash
  cd apps/web && npx vitest run src/lib/investments/usePortfolioSnapshot.test.ts
  ```

  Expected: all tests PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/src/lib/investments/usePortfolioSnapshot.ts apps/web/src/lib/investments/usePortfolioSnapshot.test.ts
  git commit -m "feat(investments): add usePortfolioSnapshot hook and computePortfolioTotalValue helper"
  ```

---

## Task 5: `PerformanceCard` UI + wire up in `OverviewTab`

**Files:**
- Modify: `apps/web/src/pages/investments/OverviewTab.tsx`

- [ ] **Step 1: Update imports**

  At the top of `apps/web/src/pages/investments/OverviewTab.tsx`, make these changes:

  Add `Area`, `AreaChart`, `XAxis` to the recharts import:
  ```ts
  import { Area, AreaChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
  ```

  Add `AXIS_TICK` to the chartTheme import:
  ```ts
  import { AXIS_TICK, TOOLTIP_STYLE } from '../../lib/charts/chartTheme'
  ```

  Add new imports after the existing imports:
  ```ts
  import { type RangeKey, type SnapshotPoint, computeReturn, filterSnapshotsByRange } from '../../lib/investments/portfolioPerformance'
  import { usePortfolioSnapshot } from '../../lib/investments/usePortfolioSnapshot'
  import type { DbPortfolioSnapshot } from '../../lib/db/db'
  ```

- [ ] **Step 2: Delete `PerformanceSparkline` and add `PerformanceCard`**

  Remove the entire `PerformanceSparkline` function (the placeholder with the TODO comment) and replace it with `PerformanceCard`:

  ```tsx
  const PERFORMANCE_RANGES: RangeKey[] = ['1M', '3M', '6M', '1Y', 'YTD', 'All']

  function PerformanceCard({
    snapshots,
    preferredCurrency,
    fxRates,
  }: {
    snapshots: DbPortfolioSnapshot[]
    preferredCurrency: CurrencyOption
    fxRates: Record<string, number> | null
  }) {
    const [range, setRange] = useState<RangeKey>('1Y')

    const shouldConvert = preferredCurrency !== 'Original' && fxRates != null

    const points: SnapshotPoint[] = snapshots.map((s) => ({
      date: s.date,
      value:
        shouldConvert && s.currency !== preferredCurrency
          ? convertAmount(s.totalValue, s.currency, preferredCurrency, fxRates)
          : s.totalValue,
    }))

    const filtered = filterSnapshotsByRange(points, range, new Date())
    const ret = computeReturn(filtered)

    const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const currencyLabel = preferredCurrency === 'Original' ? '' : `${preferredCurrency} `

    const returnColor =
      ret === null || ret.pct === 0
        ? 'text-gray-900 dark:text-white'
        : ret.pct > 0
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-red-600 dark:text-red-400'

    return (
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-sm font-medium text-gray-900 dark:text-white">Performance</h3>
          <div className="flex gap-1">
            {PERFORMANCE_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                  r === range
                    ? 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100'
                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {ret !== null && (
          <div className="mb-4">
            <div className={`font-mono text-2xl font-semibold tabular-nums ${returnColor}`}>
              {ret.pct >= 0 ? '+' : ''}
              {ret.pct.toFixed(2)}%
            </div>
            <div className="text-xs text-gray-400">
              {ret.abs >= 0 ? '+' : ''}
              {currencyLabel}
              {fmt(ret.abs)}
            </div>
          </div>
        )}

        {filtered.length < 2 ? (
          <div className="flex h-40 items-center justify-center text-sm text-gray-400">
            Sync again to start building history
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={filtered} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="perfGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={40} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: number) => [`${currencyLabel}${fmt(value)}`, 'Value']}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--accent)"
                strokeWidth={2}
                fill="url(#perfGradient)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 3: Update `OverviewTab` — add snapshot query, call hook, update loading check, replace render**

  In the `OverviewTab` function body:

  **Add snapshot query** after the existing `useLiveQuery` calls:
  ```ts
  const snapshots = useLiveQuery(() => db.portfolioSnapshots.orderBy('date').toArray(), [])
  ```

  **Add `snapshots === undefined` to the `isLoading` check:**
  ```ts
  const isLoading =
    positions === undefined ||
    accounts === undefined ||
    fundDetails === undefined ||
    buckets === undefined ||
    assignments === undefined ||
    snapshots === undefined
  ```

  **Call the snapshot hook** after the `isLoading` declaration:
  ```ts
  usePortfolioSnapshot(preferredCurrency, fxRates)
  ```

  **Replace the Performance sparkline render block** (the `{!isLoading && hasData && ...}` block at the bottom of the return) with:
  ```tsx
  {/* Performance card */}
  {!isLoading && (
    <div className="md:col-span-2 lg:col-span-3">
      <PerformanceCard
        snapshots={snapshots!}
        preferredCurrency={preferredCurrency}
        fxRates={fxRates}
      />
    </div>
  )}
  ```

  Note: `PerformanceCard` is shown even when `!hasData` because it has its own empty state ("Sync again to start building history").

- [ ] **Step 4: Run the full test suite**

  ```bash
  cd apps/web && npx vitest run
  ```

  Expected: all tests PASS with no regressions.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/src/pages/investments/OverviewTab.tsx
  git commit -m "feat(investments): add PerformanceCard with area chart and snapshot-based returns"
  ```
