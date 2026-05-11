# Investment Portfolio Buckets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Portfolio buckets so users can assign stock-like securities to one bucket, filter Holdings by bucket, see bucket allocation in Overview, and preserve bucket data in Profile backups.

**Architecture:** Keep synced brokerage positions immutable and store user bucket metadata in dedicated Dexie tables. Put bucket identity, assignment, filtering, and aggregation logic in pure helpers so Holdings, Overview, and backup import/export reuse the same behavior. Refactor Profile backup handling into a small testable helper instead of expanding the current large component.

**Tech Stack:** React 19, Vite, TypeScript, Dexie, dexie-react-hooks, Recharts, Vitest, Testing Library, Tailwind/CSS vars.

---

## File Structure

- Create `apps/web/src/lib/investments/portfolioBuckets.ts`
  - Owns default bucket definitions, stock-like detection, security key generation, assignment lookup, value aggregation, and bucket filtering helpers.
- Create `apps/web/src/lib/investments/portfolioBuckets.test.ts`
  - Unit tests for defaults, security keys, same-symbol assignment reuse, filtering, deletion helper behavior, and overview aggregation.
- Create `apps/web/src/pages/investments/PortfolioBucketCombobox.tsx`
  - Investment-specific combobox mirroring transaction category UX: select, clear, search, and create bucket inline.
- Create `apps/web/src/pages/investments/PortfolioBucketManager.tsx`
  - Compact modal for create, rename, recolor, reorder, and delete.
- Create `apps/web/src/lib/db/backup.ts`
  - Pure backup helpers for export/import normalization, validation, table clearing/restoring, and default bucket availability after older backup import.
- Create `apps/web/src/lib/db/backup.test.ts`
  - Tests for v4 export shape, v4 validation, v1-v3 compatibility, and default bucket restoration after older imports.
- Modify `apps/web/src/lib/db/db.ts`
  - Add `DbPortfolioBucket`, `DbPortfolioBucketAssignment`, Dexie tables, v9 stores, and populate seeding.
- Modify `apps/web/src/pages/profile/ProfilePage.tsx`
  - Use `backup.ts` helpers for export/import and keep the Profile UI behavior the same.
- Modify `apps/web/src/pages/investments/HoldingsTab.tsx`
  - Add Bucket column, combobox assignment, bucket filter, and manager modal.
- Modify `apps/web/src/pages/investments/OverviewTab.tsx`
  - Load buckets/assignments and add Portfolio by bucket card.

---

### Task 1: Portfolio Bucket Domain Helpers

**Files:**
- Create: `apps/web/src/lib/investments/portfolioBuckets.ts`
- Test: `apps/web/src/lib/investments/portfolioBuckets.test.ts`

- [ ] **Step 1: Write failing tests for bucket defaults, security keys, filtering, delete cleanup, and aggregation**

Create `apps/web/src/lib/investments/portfolioBuckets.test.ts`:

```ts
import type { BrokeragePosition } from '@lokfi/brokerage-core'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PORTFOLIO_BUCKETS,
  buildBucketLookup,
  buildBucketOptions,
  filterPositionsByBucket,
  getPortfolioBucketAggregation,
  getSecurityKey,
  isStockLikePosition,
  removeAssignmentsForBucket,
} from './portfolioBuckets'

function position(overrides: Partial<BrokeragePosition> = {}): BrokeragePosition {
  return {
    id: overrides.id ?? 'pos-1',
    source: overrides.source ?? 'test',
    symbol: overrides.symbol ?? 'AAPL',
    name: overrides.name ?? 'Apple Inc.',
    quantity: overrides.quantity ?? 10,
    avgCost: overrides.avgCost ?? 100,
    currency: overrides.currency ?? 'USD',
    secType: overrides.secType ?? 'STK',
    marketValue: overrides.marketValue,
    lastUpdatedAt: overrides.lastUpdatedAt ?? '2026-05-11T00:00:00.000Z',
  }
}

describe('portfolioBuckets', () => {
  it('defines sparse default portfolio buckets in display order', () => {
    expect(DEFAULT_PORTFOLIO_BUCKETS.map((bucket) => bucket.name)).toEqual(['Growth', 'Income', 'Cash'])
    expect(DEFAULT_PORTFOLIO_BUCKETS.map((bucket) => bucket.sortOrder)).toEqual([0, 1, 2])
  })

  it('builds a stock-like security key from secType and uppercased symbol', () => {
    expect(getSecurityKey(position({ symbol: 'aapl', secType: 'STK' }))).toBe('STK:AAPL')
    expect(getSecurityKey(position({ symbol: 'sgov', secType: undefined }))).toBe('STK:SGOV')
    expect(getSecurityKey(position({ symbol: 'AAPL', secType: 'FUND' }))).toBe('FUND:AAPL')
  })

  it('identifies stock-like positions and excludes derivatives', () => {
    expect(isStockLikePosition(position({ secType: 'STK' }))).toBe(true)
    expect(isStockLikePosition(position({ secType: 'FUND' }))).toBe(true)
    expect(isStockLikePosition(position({ secType: 'CASH' }))).toBe(true)
    expect(isStockLikePosition(position({ secType: 'OPT' }))).toBe(false)
    expect(isStockLikePosition(position({ secType: 'FUT' }))).toBe(false)
  })

  it('filters positions by assigned bucket and unassigned state', () => {
    const apple = position({ id: 'p1', symbol: 'AAPL' })
    const microsoft = position({ id: 'p2', symbol: 'MSFT' })
    const appleOption = position({ id: 'p3', symbol: 'AAPL', secType: 'OPT' })
    const assignments = [{ securityKey: 'STK:AAPL', bucketId: 'bucket_growth', createdAt: 'now', updatedAt: 'now' }]

    expect(filterPositionsByBucket([apple, microsoft, appleOption], assignments, 'all')).toEqual([
      apple,
      microsoft,
      appleOption,
    ])
    expect(filterPositionsByBucket([apple, microsoft, appleOption], assignments, 'bucket_growth')).toEqual([apple])
    expect(filterPositionsByBucket([apple, microsoft, appleOption], assignments, 'unassigned')).toEqual([microsoft])
  })

  it('removes assignments for a deleted bucket', () => {
    const assignments = [
      { securityKey: 'STK:AAPL', bucketId: 'bucket_growth', createdAt: 'now', updatedAt: 'now' },
      { securityKey: 'STK:MSFT', bucketId: 'bucket_income', createdAt: 'now', updatedAt: 'now' },
    ]

    expect(removeAssignmentsForBucket(assignments, 'bucket_growth')).toEqual([
      { securityKey: 'STK:MSFT', bucketId: 'bucket_income', createdAt: 'now', updatedAt: 'now' },
    ])
  })

  it('aggregates stock-like positions by bucket and excludes derivatives', () => {
    const buckets = [
      { id: 'bucket_growth', name: 'Growth', color: '#3b82f6', sortOrder: 0, isDefault: true, createdAt: 'now', updatedAt: 'now' },
      { id: 'bucket_income', name: 'Income', color: '#22c55e', sortOrder: 1, isDefault: true, createdAt: 'now', updatedAt: 'now' },
    ]
    const positions = [
      position({ id: 'p1', symbol: 'AAPL', marketValue: 1200 }),
      position({ id: 'p2', symbol: 'AAPL', marketValue: 800 }),
      position({ id: 'p3', symbol: 'SCHD', marketValue: 1000 }),
      position({ id: 'p4', symbol: 'AAPL', secType: 'OPT', marketValue: 500 }),
      position({ id: 'p5', symbol: 'MSFT', quantity: 2, avgCost: 300, marketValue: undefined }),
    ]
    const assignments = [
      { securityKey: 'STK:AAPL', bucketId: 'bucket_growth', createdAt: 'now', updatedAt: 'now' },
      { securityKey: 'STK:SCHD', bucketId: 'bucket_income', createdAt: 'now', updatedAt: 'now' },
    ]

    expect(getPortfolioBucketAggregation({ positions, buckets, assignments, convertValue: (value) => value })).toEqual([
      { bucketId: 'bucket_growth', name: 'Growth', color: '#3b82f6', value: 2000, pct: 55.55555555555556 },
      { bucketId: 'bucket_income', name: 'Income', color: '#22c55e', value: 1000, pct: 27.77777777777778 },
      { bucketId: 'unassigned', name: 'Unassigned', color: '#94a3b8', value: 600, pct: 16.666666666666664 },
    ])
  })

  it('builds bucket options with Unassigned after user buckets', () => {
    const lookup = buildBucketLookup(DEFAULT_PORTFOLIO_BUCKETS)
    expect(lookup.get('bucket_growth')?.name).toBe('Growth')
    expect(buildBucketOptions(DEFAULT_PORTFOLIO_BUCKETS).map((option) => option.label)).toEqual([
      'All buckets',
      'Growth',
      'Income',
      'Cash',
      'Unassigned',
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @lokfi/web test -- src/lib/investments/portfolioBuckets.test.ts
```

Expected: FAIL because `portfolioBuckets.ts` does not exist.

- [ ] **Step 3: Implement pure bucket helpers**

Create `apps/web/src/lib/investments/portfolioBuckets.ts`:

```ts
import type { BrokeragePosition } from '@lokfi/brokerage-core'
import type { DbPortfolioBucket, DbPortfolioBucketAssignment } from '../db/db'

export const UNASSIGNED_BUCKET_ID = 'unassigned'

export const DEFAULT_PORTFOLIO_BUCKETS: DbPortfolioBucket[] = [
  {
    id: 'bucket_growth',
    name: 'Growth',
    color: '#3b82f6',
    sortOrder: 0,
    isDefault: true,
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z',
  },
  {
    id: 'bucket_income',
    name: 'Income',
    color: '#22c55e',
    sortOrder: 1,
    isDefault: true,
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z',
  },
  {
    id: 'bucket_cash',
    name: 'Cash',
    color: '#f59e0b',
    sortOrder: 2,
    isDefault: true,
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z',
  },
]

const STOCK_LIKE_TYPES = new Set(['STK', 'CASH', 'FUND', 'MLEG'])

export interface BucketAggregationRow {
  bucketId: string
  name: string
  color: string
  value: number
  pct: number
}

export type BucketFilterValue = 'all' | 'unassigned' | string

export function isStockLikePosition(position: BrokeragePosition): boolean {
  return position.secType == null || STOCK_LIKE_TYPES.has(position.secType)
}

export function getSecurityKey(position: BrokeragePosition): string {
  const secType = position.secType ?? 'STK'
  return `${secType}:${position.symbol.trim().toUpperCase()}`
}

export function buildBucketLookup(buckets: DbPortfolioBucket[]): Map<string, DbPortfolioBucket> {
  return new Map(buckets.map((bucket) => [bucket.id, bucket]))
}

export function buildAssignmentLookup(assignments: DbPortfolioBucketAssignment[]): Map<string, string> {
  return new Map(assignments.map((assignment) => [assignment.securityKey, assignment.bucketId]))
}

export function getAssignedBucketId(
  position: BrokeragePosition,
  assignments: DbPortfolioBucketAssignment[]
): string | null {
  return buildAssignmentLookup(assignments).get(getSecurityKey(position)) ?? null
}

export function removeAssignmentsForBucket(
  assignments: DbPortfolioBucketAssignment[],
  bucketId: string
): DbPortfolioBucketAssignment[] {
  return assignments.filter((assignment) => assignment.bucketId !== bucketId)
}

export function filterPositionsByBucket(
  positions: BrokeragePosition[],
  assignments: DbPortfolioBucketAssignment[],
  filter: BucketFilterValue
): BrokeragePosition[] {
  if (filter === 'all') return positions
  const assignmentBySecurity = buildAssignmentLookup(assignments)
  return positions.filter((position) => {
    if (!isStockLikePosition(position)) return filter === 'all'
    const assignedBucketId = assignmentBySecurity.get(getSecurityKey(position)) ?? null
    if (filter === UNASSIGNED_BUCKET_ID) return assignedBucketId == null
    return assignedBucketId === filter
  })
}

export function buildBucketOptions(buckets: DbPortfolioBucket[]): Array<{ id: string; label: string }> {
  return [
    { id: 'all', label: 'All buckets' },
    ...[...buckets].sort((a, b) => a.sortOrder - b.sortOrder).map((bucket) => ({ id: bucket.id, label: bucket.name })),
    { id: UNASSIGNED_BUCKET_ID, label: 'Unassigned' },
  ]
}

export function getPortfolioBucketAggregation({
  positions,
  buckets,
  assignments,
  convertValue,
}: {
  positions: BrokeragePosition[]
  buckets: DbPortfolioBucket[]
  assignments: DbPortfolioBucketAssignment[]
  convertValue: (value: number, position: BrokeragePosition) => number
}): BucketAggregationRow[] {
  const bucketById = buildBucketLookup(buckets)
  const assignmentBySecurity = buildAssignmentLookup(assignments)
  const totals = new Map<string, number>()

  for (const position of positions) {
    if (!isStockLikePosition(position)) continue
    const rawValue = position.marketValue ?? position.quantity * position.avgCost
    if (rawValue <= 0) continue
    const assignedBucketId = assignmentBySecurity.get(getSecurityKey(position))
    const bucketId = assignedBucketId && bucketById.has(assignedBucketId) ? assignedBucketId : UNASSIGNED_BUCKET_ID
    totals.set(bucketId, (totals.get(bucketId) ?? 0) + convertValue(rawValue, position))
  }

  const totalValue = [...totals.values()].reduce((sum, value) => sum + value, 0)
  const rows: BucketAggregationRow[] = []
  for (const bucket of [...buckets].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const value = totals.get(bucket.id) ?? 0
    if (value <= 0) continue
    rows.push({ bucketId: bucket.id, name: bucket.name, color: bucket.color, value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 })
  }

  const unassignedValue = totals.get(UNASSIGNED_BUCKET_ID) ?? 0
  if (unassignedValue > 0) {
    rows.push({
      bucketId: UNASSIGNED_BUCKET_ID,
      name: 'Unassigned',
      color: '#94a3b8',
      value: unassignedValue,
      pct: totalValue > 0 ? (unassignedValue / totalValue) * 100 : 0,
    })
  }

  return rows
}
```

- [ ] **Step 4: Run tests to verify helpers pass**

Run:

```bash
pnpm --filter @lokfi/web test -- src/lib/investments/portfolioBuckets.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/investments/portfolioBuckets.ts apps/web/src/lib/investments/portfolioBuckets.test.ts
git commit -m "feat(web): add portfolio bucket helpers"
```

---

### Task 2: Dexie Schema And Default Bucket Seeding

**Files:**
- Modify: `apps/web/src/lib/db/db.ts`
- Test: `apps/web/src/lib/investments/portfolioBuckets.test.ts`

- [ ] **Step 1: Add failing test for timestamped default bucket seeding helper**

Append to `apps/web/src/lib/investments/portfolioBuckets.test.ts`:

```ts
import { createDefaultPortfolioBuckets } from './portfolioBuckets'

describe('createDefaultPortfolioBuckets', () => {
  it('stamps default buckets at migration time while keeping stable ids', () => {
    const buckets = createDefaultPortfolioBuckets('2026-05-11T12:00:00.000Z')

    expect(buckets).toEqual([
      { id: 'bucket_growth', name: 'Growth', color: '#3b82f6', sortOrder: 0, isDefault: true, createdAt: '2026-05-11T12:00:00.000Z', updatedAt: '2026-05-11T12:00:00.000Z' },
      { id: 'bucket_income', name: 'Income', color: '#22c55e', sortOrder: 1, isDefault: true, createdAt: '2026-05-11T12:00:00.000Z', updatedAt: '2026-05-11T12:00:00.000Z' },
      { id: 'bucket_cash', name: 'Cash', color: '#f59e0b', sortOrder: 2, isDefault: true, createdAt: '2026-05-11T12:00:00.000Z', updatedAt: '2026-05-11T12:00:00.000Z' },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @lokfi/web test -- src/lib/investments/portfolioBuckets.test.ts
```

Expected: FAIL because `createDefaultPortfolioBuckets` is not exported.

- [ ] **Step 3: Add default bucket factory and Dexie types/tables**

Modify `apps/web/src/lib/investments/portfolioBuckets.ts` to add:

```ts
export function createDefaultPortfolioBuckets(timestamp = new Date().toISOString()): DbPortfolioBucket[] {
  return DEFAULT_PORTFOLIO_BUCKETS.map((bucket) => ({
    ...bucket,
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
}
```

Modify `apps/web/src/lib/db/db.ts`:

```ts
import { createDefaultPortfolioBuckets } from '../investments/portfolioBuckets'
```

Add interfaces after `DbBudget`:

```ts
export interface DbPortfolioBucket {
  id: string
  name: string
  color: string
  sortOrder: number
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface DbPortfolioBucketAssignment {
  securityKey: string
  bucketId: string
  createdAt: string
  updatedAt: string
}
```

Add tables to `LokfiDatabase`:

```ts
  portfolioBuckets!: Table<DbPortfolioBucket>
  portfolioBucketAssignments!: Table<DbPortfolioBucketAssignment>
```

Add schema version after v8:

```ts
    // v9 schema (adds user-defined investment portfolio buckets)
    this.version(9)
      .stores({
        portfolioBuckets: 'id, sortOrder, name',
        portfolioBucketAssignments: 'securityKey, bucketId',
      })
      .upgrade(async (trans) => {
        const table = trans.table('portfolioBuckets')
        const count = await table.count()
        if (count === 0) {
          await table.bulkAdd(createDefaultPortfolioBuckets())
        }
      })
```

Update populate handler:

```ts
    this.on('populate', () => {
      this.categories.bulkAdd(defaultCategories)
      this.portfolioBuckets.bulkAdd(createDefaultPortfolioBuckets())
    })
```

- [ ] **Step 4: Run targeted tests and typecheck build**

Run:

```bash
pnpm --filter @lokfi/web test -- src/lib/investments/portfolioBuckets.test.ts
pnpm --filter @lokfi/web build
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/db/db.ts apps/web/src/lib/investments/portfolioBuckets.ts apps/web/src/lib/investments/portfolioBuckets.test.ts
git commit -m "feat(web): persist portfolio bucket tables"
```

---

### Task 3: Backup Export And Import Compatibility

**Files:**
- Create: `apps/web/src/lib/db/backup.ts`
- Create: `apps/web/src/lib/db/backup.test.ts`
- Modify: `apps/web/src/pages/profile/ProfilePage.tsx`

- [ ] **Step 1: Write failing backup helper tests**

Create `apps/web/src/lib/db/backup.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  BACKUP_VERSION,
  buildImportSummary,
  normalizeBackupForImport,
  validateBackupShape,
} from './backup'

const baseV3 = {
  version: 3,
  exportedAt: '2026-05-11T00:00:00.000Z',
  transactions: [],
  rules: [],
  categories: [],
  customParsers: [],
  budgets: [],
  brokeragePositions: [],
  brokeragePositionExtensions: [],
  brokerageTransactions: [],
  brokerageFundDetails: [],
  brokerageAccounts: [],
  brokerageSyncLog: [],
  brokerageCredentials: [],
}

describe('backup helpers', () => {
  it('uses backup version 4 for portfolio buckets', () => {
    expect(BACKUP_VERSION).toBe(4)
  })

  it('requires portfolio bucket arrays for v4 backups', () => {
    expect(validateBackupShape({ ...baseV3, version: 4 }).valid).toBe(false)
    expect(validateBackupShape({ ...baseV3, version: 4, portfolioBuckets: [], portfolioBucketAssignments: [] })).toEqual({
      valid: true,
    })
  })

  it('normalizes older v1-v3 backups with empty bucket arrays', () => {
    const normalized = normalizeBackupForImport(baseV3)

    expect(normalized.portfolioBuckets).toEqual([])
    expect(normalized.portfolioBucketAssignments).toEqual([])
  })

  it('keeps v4 bucket arrays during normalization', () => {
    const normalized = normalizeBackupForImport({
      ...baseV3,
      version: 4,
      portfolioBuckets: [{ id: 'bucket_growth', name: 'Growth', color: '#3b82f6', sortOrder: 0, isDefault: true, createdAt: 'now', updatedAt: 'now' }],
      portfolioBucketAssignments: [{ securityKey: 'STK:AAPL', bucketId: 'bucket_growth', createdAt: 'now', updatedAt: 'now' }],
    })

    expect(normalized.portfolioBuckets).toHaveLength(1)
    expect(normalized.portfolioBucketAssignments).toHaveLength(1)
  })

  it('includes bucket counts in import summary', () => {
    const summary = buildImportSummary({
      ...normalizeBackupForImport(baseV3),
      portfolioBuckets: [{ id: 'bucket_growth', name: 'Growth', color: '#3b82f6', sortOrder: 0, isDefault: true, createdAt: 'now', updatedAt: 'now' }],
      portfolioBucketAssignments: [{ securityKey: 'STK:AAPL', bucketId: 'bucket_growth', createdAt: 'now', updatedAt: 'now' }],
    })

    expect(summary).toContain('1 portfolio bucket(s)')
    expect(summary).toContain('1 portfolio bucket assignment(s)')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @lokfi/web test -- src/lib/db/backup.test.ts
```

Expected: FAIL because `backup.ts` does not exist.

- [ ] **Step 3: Implement backup helpers**

Create `apps/web/src/lib/db/backup.ts`:

```ts
import type { LokfiDatabase } from './db'
import { createDefaultPortfolioBuckets } from '../investments/portfolioBuckets'

export const BACKUP_VERSION = 4

export interface LokfiBackup {
  version: 1 | 2 | 3 | 4
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
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

export function validateBackupShape(data: unknown): { valid: true } | { valid: false; message: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, message: 'Invalid backup file: expected an object.' }
  }
  const candidate = data as Record<string, unknown>
  if (![1, 2, 3, 4].includes(Number(candidate.version))) {
    return { valid: false, message: 'Invalid backup file: unsupported backup version.' }
  }
  for (const key of ['transactions', 'rules', 'categories', 'customParsers', 'budgets']) {
    if (!isArray(candidate[key])) return { valid: false, message: `Invalid backup file: missing ${key} array.` }
  }
  if (Number(candidate.version) >= 2) {
    for (const key of ['brokeragePositions', 'brokeragePositionExtensions', 'brokerageTransactions', 'brokerageAccounts', 'brokerageSyncLog', 'brokerageCredentials']) {
      if (!isArray(candidate[key])) return { valid: false, message: `Invalid brokerage backup file: missing ${key} array.` }
    }
  }
  if (Number(candidate.version) >= 3 && !isArray(candidate.brokerageFundDetails)) {
    return { valid: false, message: 'Invalid v3 backup file: missing brokerageFundDetails array.' }
  }
  if (Number(candidate.version) === 4) {
    if (!isArray(candidate.portfolioBuckets) || !isArray(candidate.portfolioBucketAssignments)) {
      return { valid: false, message: 'Invalid v4 backup file: missing portfolio bucket arrays.' }
    }
  }
  return { valid: true }
}

export function normalizeBackupForImport(data: Record<string, unknown>): LokfiBackup {
  const version = Number(data.version) as 1 | 2 | 3 | 4
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
    portfolioBuckets: version === 4 ? (data.portfolioBuckets as unknown[]) : [],
    portfolioBucketAssignments: version === 4 ? (data.portfolioBucketAssignments as unknown[]) : [],
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
      ])
      if (data.transactions.length) await db.transactions.bulkAdd(data.transactions as never[])
      if (data.rules.length) await db.rules.bulkAdd(data.rules as never[])
      if (data.categories.length) await db.categories.bulkAdd(data.categories as never[])
      if (data.customParsers.length) await db.customParsers.bulkAdd(data.customParsers as never[])
      if (data.budgets.length) await db.budgets.bulkAdd(data.budgets as never[])
      if (data.brokeragePositions.length) await db.brokeragePositions.bulkAdd(data.brokeragePositions as never[])
      if (data.brokeragePositionExtensions.length) await db.brokeragePositionExtensions.bulkAdd(data.brokeragePositionExtensions as never[])
      if (data.brokerageTransactions.length) await db.brokerageTransactions.bulkAdd(data.brokerageTransactions as never[])
      if (data.brokerageFundDetails.length) await db.brokerageFundDetails.bulkAdd(data.brokerageFundDetails as never[])
      if (data.brokerageAccounts.length) await db.brokerageAccounts.bulkAdd(data.brokerageAccounts as never[])
      if (data.brokerageSyncLog.length) await db.brokerageSyncLog.bulkAdd(data.brokerageSyncLog as never[])
      if (data.brokerageCredentials.length) await db.brokerageCredentials.bulkAdd(data.brokerageCredentials as never[])
      const buckets = data.portfolioBuckets.length ? data.portfolioBuckets : createDefaultPortfolioBuckets()
      if (buckets.length) await db.portfolioBuckets.bulkAdd(buckets as never[])
      if (data.portfolioBucketAssignments.length) {
        await db.portfolioBucketAssignments.bulkAdd(data.portfolioBucketAssignments as never[])
      }
    }
  )
}
```

- [ ] **Step 4: Refactor `ProfilePage` to use backup helpers**

In `apps/web/src/pages/profile/ProfilePage.tsx`, import:

```ts
import {
  buildBackupPayload,
  buildImportSummary,
  importBackupPayload,
  normalizeBackupForImport,
  validateBackupShape,
} from '../../lib/db/backup'
```

Replace `handleExport` body with:

```ts
    const data = await buildBackupPayload(db)
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'lokfi-backup.json'
    a.click()
    URL.revokeObjectURL(url)
    await StorageManager.recordExportEvent()
```

Replace validation/import logic in `handleImportBackup` after `const data = JSON.parse(text)` with:

```ts
      const validation = validateBackupShape(data)
      if (!validation.valid) {
        alert(validation.message)
        e.target.value = ''
        return
      }

      const normalized = normalizeBackupForImport(data)
      const confirmed = window.confirm(buildImportSummary(normalized))
      if (!confirmed) {
        e.target.value = ''
        return
      }

      await importBackupPayload(db, normalized)
      alert('Backup imported successfully!')
```

Remove the old manually enumerated validation, confirmation, transaction, clear, and bulk-add code.

- [ ] **Step 5: Run backup tests and build**

Run:

```bash
pnpm --filter @lokfi/web test -- src/lib/db/backup.test.ts
pnpm --filter @lokfi/web build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/db/backup.ts apps/web/src/lib/db/backup.test.ts apps/web/src/pages/profile/ProfilePage.tsx
git commit -m "feat(web): include portfolio buckets in backups"
```

---

### Task 4: Bucket Assignment UI And Holdings Filter

**Files:**
- Create: `apps/web/src/pages/investments/PortfolioBucketCombobox.tsx`
- Create: `apps/web/src/pages/investments/PortfolioBucketManager.tsx`
- Modify: `apps/web/src/pages/investments/HoldingsTab.tsx`

- [ ] **Step 1: Create `PortfolioBucketCombobox` following transaction category behavior**

Create `apps/web/src/pages/investments/PortfolioBucketCombobox.tsx`:

```tsx
import { Settings } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../../lib/db/db'
import type { DbPortfolioBucket } from '../../lib/db/db'

const CUSTOM_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#64748b', '#ef4444']

interface PortfolioBucketComboboxProps {
  value: string | null
  onChange: (id: string | null) => void
  onManage: () => void
  placeholder?: string
}

type ComboboxOption =
  | { type: 'clear'; id: string }
  | { type: 'bucket'; id: string; bucket: DbPortfolioBucket }
  | { type: 'create'; name: string }
  | { type: 'manage'; id: string }

export function PortfolioBucketCombobox({
  value,
  onChange,
  onManage,
  placeholder = 'Unassigned',
}: PortfolioBucketComboboxProps) {
  const [open, setOpen] = useState(false)
  const [inputText, setInputText] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const buckets = useLiveQuery(() => db.portfolioBuckets.orderBy('sortOrder').toArray(), []) ?? []
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const creatingRef = useRef(false)

  const selectedBucket = buckets.find((bucket) => bucket.id === value) ?? null
  const filtered = buckets.filter((bucket) => bucket.name.toLowerCase().includes(inputText.toLowerCase()))
  const showCreate =
    inputText.trim().length > 0 &&
    !buckets.some((bucket) => bucket.name.toLowerCase() === inputText.trim().toLowerCase())

  const options = useMemo(() => {
    const opts: ComboboxOption[] = [{ type: 'clear', id: '' }]
    filtered.forEach((bucket) => opts.push({ type: 'bucket', id: bucket.id, bucket }))
    if (showCreate) opts.push({ type: 'create', name: inputText.trim() })
    opts.push({ type: 'manage', id: 'manage' })
    return opts
  }, [filtered, showCreate, inputText])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleMouseDown)
      return () => document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [open])

  async function handleCreateBucket() {
    const name = inputText.trim()
    if (!name || creatingRef.current) return
    creatingRef.current = true
    try {
      const now = new Date().toISOString()
      const id = 'bucket_' + crypto.randomUUID()
      const color = CUSTOM_COLORS[buckets.length % CUSTOM_COLORS.length]
      const sortOrder = buckets.length
      await db.portfolioBuckets.put({ id, name, color, sortOrder, isDefault: false, createdAt: now, updatedAt: now })
      onChange(id)
      setOpen(false)
    } finally {
      creatingRef.current = false
    }
  }

  function selectBucket(id: string | null) {
    onChange(id)
    setOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((index) => (index + 1) % Math.max(1, options.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((index) => (index - 1 + options.length) % Math.max(1, options.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = options[highlightedIndex]
      if (!option) return
      if (option.type === 'clear') selectBucket(null)
      if (option.type === 'bucket') selectBucket(option.id)
      if (option.type === 'create') handleCreateBucket()
      if (option.type === 'manage') {
        setOpen(false)
        onManage()
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => {
          setInputText('')
          setHighlightedIndex(0)
          setOpen((current) => !current)
        }}
        className="inline-flex min-w-[8rem] max-w-[12rem] items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none dark:bg-gray-900 dark:text-white"
        style={{ borderColor: 'var(--border)' }}
      >
        {selectedBucket ? (
          <>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: selectedBucket.color }} />
            <span className="truncate">{selectedBucket.name}</span>
          </>
        ) : (
          <span className="truncate text-gray-400 dark:text-gray-500">{placeholder}</span>
        )}
        <span className="ml-auto text-xs text-gray-400">⌄</span>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-[1000] mt-1 w-60 rounded-lg border bg-white py-1 shadow-lg dark:bg-gray-900"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="px-2 pb-1">
            <input
              ref={inputRef}
              value={inputText}
              onChange={(event) => {
                setInputText(event.target.value)
                setHighlightedIndex(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search or create bucket..."
              className="w-full rounded-md border bg-white px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-white"
              style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
            />
          </div>

          <div className="max-h-40 overflow-y-auto">
            {options.map((option, index) => {
              const highlighted = index === highlightedIndex
              const baseClass = 'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors '
              const activeClass = highlighted
                ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                : 'text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800'

              if (option.type === 'clear') {
                return (
                  <button key="clear" type="button" data-highlighted={highlighted} onClick={() => selectBucket(null)} className={baseClass + activeClass}>
                    Unassigned
                  </button>
                )
              }
              if (option.type === 'bucket') {
                return (
                  <button key={option.id} type="button" data-highlighted={highlighted} onClick={() => selectBucket(option.id)} className={baseClass + activeClass}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: option.bucket.color }} />
                    <span className="truncate">{option.bucket.name}</span>
                  </button>
                )
              }
              if (option.type === 'create') {
                return (
                  <button key="create" type="button" data-highlighted={highlighted} onClick={handleCreateBucket} className={baseClass + activeClass} style={{ color: 'var(--accent)' }}>
                    + Create "{option.name}"
                  </button>
                )
              }
              return (
                <button
                  key="manage"
                  type="button"
                  data-highlighted={highlighted}
                  onClick={() => {
                    setOpen(false)
                    onManage()
                  }}
                  className={baseClass + activeClass}
                >
                  <Settings size={14} />
                  Manage buckets...
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create bucket manager modal**

Create `apps/web/src/pages/investments/PortfolioBucketManager.tsx`:

```tsx
import { ArrowDown, ArrowUp, Trash2, X } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/db'

interface PortfolioBucketManagerProps {
  open: boolean
  onClose: () => void
}

const COLOR_SWATCHES = ['#3b82f6', '#22c55e', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#64748b', '#ef4444']

export function PortfolioBucketManager({ open, onClose }: PortfolioBucketManagerProps) {
  const buckets = useLiveQuery(() => db.portfolioBuckets.orderBy('sortOrder').toArray(), []) ?? []

  if (!open) return null

  async function renameBucket(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    await db.portfolioBuckets.update(id, { name: trimmed, updatedAt: new Date().toISOString() })
  }

  async function recolorBucket(id: string, color: string) {
    await db.portfolioBuckets.update(id, { color, updatedAt: new Date().toISOString() })
  }

  async function moveBucket(id: string, direction: -1 | 1) {
    const index = buckets.findIndex((bucket) => bucket.id === id)
    const swap = buckets[index + direction]
    const current = buckets[index]
    if (!current || !swap) return
    await db.transaction('rw', [db.portfolioBuckets], async () => {
      await db.portfolioBuckets.update(current.id, { sortOrder: swap.sortOrder, updatedAt: new Date().toISOString() })
      await db.portfolioBuckets.update(swap.id, { sortOrder: current.sortOrder, updatedAt: new Date().toISOString() })
    })
  }

  async function deleteBucket(id: string) {
    const confirmed = window.confirm('Delete this portfolio bucket? Affected holdings will become Unassigned.')
    if (!confirmed) return
    await db.transaction('rw', [db.portfolioBuckets, db.portfolioBucketAssignments], async () => {
      await db.portfolioBuckets.delete(id)
      await db.portfolioBucketAssignments.where('bucketId').equals(id).delete()
    })
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-white shadow-xl dark:bg-gray-950" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-serif text-lg text-gray-900 dark:text-white">Portfolio buckets</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto p-5">
          {buckets.map((bucket, index) => (
            <div key={bucket.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <input
                  defaultValue={bucket.name}
                  onBlur={(event) => renameBucket(bucket.id, event.target.value)}
                  className="min-w-0 flex-1 rounded-md border bg-white px-2 py-1.5 text-sm text-gray-900 dark:bg-gray-900 dark:text-white"
                  style={{ borderColor: 'var(--border)' }}
                />
                <button type="button" onClick={() => moveBucket(bucket.id, -1)} disabled={index === 0} className="rounded border p-1 disabled:opacity-30" style={{ borderColor: 'var(--border)' }} aria-label="Move up">
                  <ArrowUp size={14} />
                </button>
                <button type="button" onClick={() => moveBucket(bucket.id, 1)} disabled={index === buckets.length - 1} className="rounded border p-1 disabled:opacity-30" style={{ borderColor: 'var(--border)' }} aria-label="Move down">
                  <ArrowDown size={14} />
                </button>
                <button type="button" onClick={() => deleteBucket(bucket.id)} className="rounded border p-1 text-red-500" style={{ borderColor: 'var(--border)' }} aria-label="Delete bucket">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {COLOR_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => recolorBucket(bucket.id, color)}
                    className={`h-6 w-6 rounded-full border-2 ${bucket.color === color ? 'border-gray-900 dark:border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    aria-label={`Use ${color}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire Holdings tab bucket assignment and filtering**

Modify `apps/web/src/pages/investments/HoldingsTab.tsx`:

Add imports:

```ts
import { PortfolioBucketCombobox } from './PortfolioBucketCombobox'
import { PortfolioBucketManager } from './PortfolioBucketManager'
import {
  buildAssignmentLookup,
  buildBucketOptions,
  filterPositionsByBucket,
  getSecurityKey,
  isStockLikePosition,
  UNASSIGNED_BUCKET_ID,
} from '../../lib/investments/portfolioBuckets'
```

Add state in `HoldingsTab`:

```ts
  const [bucketFilter, setBucketFilter] = useState('all')
  const [bucketManagerOpen, setBucketManagerOpen] = useState(false)
  const buckets = useLiveQuery(() => db.portfolioBuckets.orderBy('sortOrder').toArray(), []) ?? []
  const assignments = useLiveQuery(() => db.portfolioBucketAssignments.toArray(), []) ?? []
```

Before splitting into row arrays, filter stock-like positions:

```ts
  const bucketFilteredPositions = filterPositionsByBucket(allPositions ?? [], assignments, bucketFilter)
```

Then iterate `bucketFilteredPositions` instead of `allPositions ?? []` when building `stockRows` and `derivativeRows`.

Inside `HoldingsTable`, add props:

```ts
  buckets: DbPortfolioBucket[]
  assignments: DbPortfolioBucketAssignment[]
  onAssignBucket: (position: BrokeragePosition, bucketId: string | null) => void
  onManageBuckets: () => void
```

Add a `bucket` sort key only for stock rows if desired, or keep the Bucket column unsorted for v1.

Add a `Bucket` header in the stock-like branch and render a cell in stock-like rows:

```tsx
                    <td className="px-3 py-2.5 text-left">
                      <PortfolioBucketCombobox
                        value={assignmentBySecurity.get(getSecurityKey(position)) ?? null}
                        onChange={(bucketId) => onAssignBucket(position, bucketId)}
                        onManage={onManageBuckets}
                      />
                    </td>
```

Create `assignmentBySecurity` inside `HoldingsTable`:

```ts
  const assignmentBySecurity = buildAssignmentLookup(assignments)
```

Implement assignment in `HoldingsTab`:

```ts
  async function handleAssignBucket(position: BrokeragePosition, bucketId: string | null) {
    const securityKey = getSecurityKey(position)
    if (bucketId == null) {
      await db.portfolioBucketAssignments.delete(securityKey)
      return
    }
    const now = new Date().toISOString()
    await db.portfolioBucketAssignments.put({
      securityKey,
      bucketId,
      createdAt: now,
      updatedAt: now,
    })
  }
```

Add filter control under the search input:

```tsx
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {buildBucketOptions(buckets).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setBucketFilter(option.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              bucketFilter === option.id ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
            }`}
            style={{
              borderColor: bucketFilter === option.id ? 'var(--accent)' : 'var(--border)',
              backgroundColor: bucketFilter === option.id ? 'var(--accent-subtle)' : 'transparent',
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
```

Render manager:

```tsx
      <PortfolioBucketManager open={bucketManagerOpen} onClose={() => setBucketManagerOpen(false)} />
```

Pass new props into `PositionSection` and `HoldingsTable` for stock-like rows. For derivative rows, do not render the bucket column and do not pass assignment controls.

- [ ] **Step 4: Run build**

Run:

```bash
pnpm --filter @lokfi/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/investments/HoldingsTab.tsx apps/web/src/pages/investments/PortfolioBucketCombobox.tsx apps/web/src/pages/investments/PortfolioBucketManager.tsx
git commit -m "feat(web): assign portfolio buckets to holdings"
```

---

### Task 5: Overview Portfolio By Bucket Card

**Files:**
- Modify: `apps/web/src/pages/investments/OverviewTab.tsx`
- Test: `apps/web/src/lib/investments/portfolioBuckets.test.ts`

- [ ] **Step 1: Confirm aggregation test covers overview behavior**

Run:

```bash
pnpm --filter @lokfi/web test -- src/lib/investments/portfolioBuckets.test.ts
```

Expected: PASS from Task 1. This is the coverage for Overview bucket totals, including fallback market value and derivative exclusion.

- [ ] **Step 2: Add Portfolio by bucket card component**

Modify `apps/web/src/pages/investments/OverviewTab.tsx`:

Add imports:

```ts
import type { DbPortfolioBucket, DbPortfolioBucketAssignment } from '../../lib/db/db'
import { getPortfolioBucketAggregation } from '../../lib/investments/portfolioBuckets'
```

Add component before `CurrencyBreakdown`:

```tsx
function PortfolioBucketBreakdown({
  positions,
  buckets,
  assignments,
  preferredCurrency,
  fxRates,
}: {
  positions: import('@lokfi/brokerage-core').BrokeragePosition[]
  buckets: DbPortfolioBucket[]
  assignments: DbPortfolioBucketAssignment[]
  preferredCurrency: CurrencyOption
  fxRates: Record<string, number> | null
}) {
  const shouldConvert = preferredCurrency !== 'Original' && fxRates != null
  const rows = getPortfolioBucketAggregation({
    positions,
    buckets,
    assignments,
    convertValue: (value, position) =>
      shouldConvert ? convertAmount(value, position.currency, preferredCurrency, fxRates) : value,
  })

  if (rows.length === 0) return null

  return (
    <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}>
      <h3 className="mb-4 font-serif text-sm font-medium text-gray-900 dark:text-white">Portfolio by bucket</h3>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={rows} cx="50%" cy="50%" innerRadius={55} outerRadius={75} dataKey="value" labelLine={false} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}>
            {rows.map((row) => (
              <Cell key={row.bucketId} fill={row.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number) => [
              value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              'Value',
            ]}
          />
          <Legend formatter={(value: string) => value} />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.bucketId} className="flex items-center justify-between text-xs">
            <span className="flex min-w-0 items-center gap-2 text-gray-700 dark:text-gray-300">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
              <span className="truncate">{row.name}</span>
            </span>
            <span className="font-mono text-gray-500 dark:text-gray-400">
              {row.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({row.pct.toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

Load data in `OverviewTab`:

```ts
  const buckets = useLiveQuery(() => db.portfolioBuckets.orderBy('sortOrder').toArray(), [])
  const assignments = useLiveQuery(() => db.portfolioBucketAssignments.toArray(), [])
```

Update loading state:

```ts
  const isLoading =
    positions === undefined ||
    accounts === undefined ||
    fundDetails === undefined ||
    buckets === undefined ||
    assignments === undefined
```

Render after Asset Allocation:

```tsx
      {!isLoading && hasData && (
        <PortfolioBucketBreakdown
          positions={positions!}
          buckets={buckets!}
          assignments={assignments!}
          preferredCurrency={preferredCurrency}
          fxRates={fxRates}
        />
      )}
```

- [ ] **Step 3: Run tests and build**

Run:

```bash
pnpm --filter @lokfi/web test -- src/lib/investments/portfolioBuckets.test.ts
pnpm --filter @lokfi/web build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/investments/OverviewTab.tsx apps/web/src/lib/investments/portfolioBuckets.test.ts
git commit -m "feat(web): show portfolio bucket allocation"
```

---

### Task 6: Manual UI Verification

**Files:**
- No source files expected. If verification reveals defects, modify the smallest affected source file and commit the fix in Step 5.

- [ ] **Step 1: Run full package tests**

Run:

```bash
pnpm --filter @lokfi/web test
```

Expected: PASS.

- [ ] **Step 2: Run lint/build**

Run:

```bash
pnpm --filter @lokfi/web build
pnpm --filter @lokfi/web lint
```

Expected: PASS.

- [ ] **Step 3: Start local dev server**

Run:

```bash
pnpm --filter @lokfi/web dev
```

Expected: Vite prints a localhost URL, commonly `http://localhost:5173/`.

- [ ] **Step 4: Browser verification**

Open `/investments?tab=holdings` and verify:

- Existing holdings render.
- Stock-like rows show a `Bucket` selector.
- Derivative rows do not show a bucket selector.
- Selecting `Growth`, `Income`, or `Cash` persists after refresh.
- Creating a new bucket from the selector assigns it to the security.
- Clearing returns the security to `Unassigned`.
- Bucket filter narrows visible stock-like holdings.
- Manage buckets can rename, recolor, reorder, and delete a bucket.
- Deleted bucket assignments become `Unassigned`.

Open `/investments?tab=overview` and verify:

- `Portfolio by bucket` card renders when holdings exist.
- Unassigned holdings appear as `Unassigned`.
- Values respond to the existing display-currency selector.
- Existing Asset Allocation, Currency Breakdown, and Performance sections still render.

Open `/profile` and verify:

- Exported JSON has `version: 4`.
- Exported JSON includes `portfolioBuckets` and `portfolioBucketAssignments`.
- Importing a v4 backup restores buckets and assignments.
- Importing an older v3 backup still succeeds and leaves default buckets available.

- [ ] **Step 5: Commit verification fixes if needed**

If verification required fixes:

```bash
git add apps/web/src
git commit -m "fix(web): polish portfolio bucket workflow"
```

If no fixes were needed, do not create an empty commit.

---

### Task 7: Final Whole-Repo Verification

**Files:**
- No source files expected. If final verification reveals defects, return to the affected task, fix the source file, and rerun that task's verification.

- [ ] **Step 1: Run root test command**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 2: Run root lint command**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 3: Check git status**

Run:

```bash
git status --short
```

Expected: only intentional committed changes are present. `.superpowers/` may remain untracked visual brainstorming scratch and should not be committed.

- [ ] **Step 4: Prepare final summary**

Summarize:

- New Dexie tables and migration.
- Holdings assignment/filtering.
- Overview bucket allocation.
- Profile backup/import v4 compatibility.
- Tests and verification commands run.
