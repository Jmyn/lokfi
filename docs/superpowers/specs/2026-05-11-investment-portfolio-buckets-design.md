# Investment Portfolio Buckets Design

## Summary

Add **Portfolio buckets** to Investments so users can assign each security to one user-defined investment grouping, such as `Growth`, `Income`, or `Cash`. Buckets are distinct from transaction categories and do not interact with transaction rules or `manualCategory`.

The first version focuses on three outcomes:

- Assign one bucket per security-level holding.
- Filter holdings by bucket.
- Show a pure bucket-total allocation breakdown in Investment Overview.

Custom overview visualisations are intentionally deferred, but the aggregation model should be reusable by a later configurable-widget system.

## Product Decisions

- Use the UI term **Portfolio bucket**.
- A security has exactly one bucket assignment.
- Assignments are **security-level**, not brokerage-position-level. If `AAPL` appears in multiple synced rows, all `AAPL` stock positions share one bucket.
- Default buckets are `Growth`, `Income`, and `Cash`.
- Holdings without an assignment appear as `Unassigned`.
- Bucket allocation is a pure bucket total view. It does not split buckets by listing market, holding currency, or display currency.
- Currency remains a separate lens through the existing currency selector and currency breakdown card.
- Custom visualisations are a later phase.

## Existing Context

Investment holdings are synced brokerage positions stored in Dexie:

- `packages/brokerage-core/src/types.ts` defines `BrokeragePosition`.
- `apps/web/src/lib/db/db.ts` defines `brokeragePositions`, `brokeragePositionExtensions`, `brokerageTransactions`, `brokerageFundDetails`, `brokerageAccounts`, and related stores.
- `apps/web/src/lib/brokerage/dexie-sync-adapter.ts` replaces positions during sync, so user metadata must not be stored directly on `BrokeragePosition`.
- `apps/web/src/pages/investments/OverviewTab.tsx` renders KPI cards, asset allocation, currency breakdown, and performance placeholder.
- `apps/web/src/pages/investments/HoldingsTab.tsx` renders the holdings table and computes derived holding metrics.
- Transaction category assignment uses `apps/web/src/pages/transactions/CategoryCombobox.tsx`, which provides the interaction pattern to mirror for bucket assignment: search, select, create inline, and colored labels.

## Data Model

Add dedicated user-owned Dexie tables.

```ts
interface DbPortfolioBucket {
  id: string
  name: string
  color: string
  sortOrder: number
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

interface DbPortfolioBucketAssignment {
  securityKey: string
  bucketId: string
  createdAt: string
  updatedAt: string
}
```

Suggested Dexie indexes:

- `portfolioBuckets`: `id, sortOrder, name`
- `portfolioBucketAssignments`: `securityKey, bucketId`

Use a stable security-level key instead of position id. For stock-like v1 holdings, use a normalized key shaped like:

```ts
`${secType ?? 'STK'}:${symbol.toUpperCase()}`
```

This keeps `AAPL` stock assignments stable across brokerage sync replacement and across multiple position rows. Derivatives are excluded from v1 bucket assignment and bucket totals.

Seed default buckets through a database migration so existing users receive `Growth`, `Income`, and `Cash`. Initial database population should also create the same defaults for new users.

Profile backup export/import must include `portfolioBuckets` and `portfolioBucketAssignments`.

`apps/web/src/pages/profile/ProfilePage.tsx` currently builds backup JSON by manually reading each Dexie table and validates imports by backup `version`. Implementation must update this path explicitly:

- Increment the backup format from `version: 3` to `version: 4`.
- Export `portfolioBuckets` and `portfolioBucketAssignments` arrays in the backup JSON.
- Treat both arrays as required for v4 imports.
- Include both tables in the import confirmation summary.
- Include both tables in the destructive import transaction table list.
- Clear and restore both tables during v4 import.
- Continue accepting older v1-v3 backups by defaulting missing portfolio bucket arrays to empty arrays.
- After importing an older backup that has no bucket tables, ensure default buckets exist so the Investments UI still has `Growth`, `Income`, and `Cash`.

## Holdings UX

Add a `Bucket` column to the stock-like holdings table. Each row shows a compact colored selector for the security's assigned bucket, or `Unassigned`.

The selector should follow the transaction category assignment behavior:

- Search existing buckets.
- Select a bucket.
- Create a new bucket inline from typed text.
- Show colored bucket indicators.
- Commit assignment immediately.
- Allow clearing the assignment, returning the security to `Unassigned`.

The UI should say `bucket` or `Portfolio bucket`, not `category`, to avoid confusion with transaction categories.

Add a bucket filter near the existing holdings search:

- `All buckets`
- Each user bucket in sort order
- `Unassigned`

Filtering applies to the visible holdings table. Grouping can remain currency-based for v1; the bucket filter satisfies the core need to narrow holdings by user-defined investment grouping.

## Bucket Management

Bucket management should be available from the bucket selector and/or the Overview bucket card. It can be a compact modal or drawer rather than a dedicated tab.

Users can:

- Create a bucket.
- Rename a bucket.
- Change its color.
- Reorder buckets.
- Delete a bucket.

Delete behavior:

- Deleting a bucket removes its assignment rows.
- Affected securities become `Unassigned`.
- Default buckets are treated like normal user buckets after seeding, so they can be renamed or deleted.

## Overview UX

Add a **Portfolio by bucket** card to `OverviewTab`.

The card aggregates current stock-like holdings by bucket. Derivatives are excluded from v1 bucket totals and remain visible in their existing Holdings section.

- Use `marketValue` when present.
- Fall back to `quantity * avgCost`.
- Convert values using the existing preferred display currency and FX conversion behavior.
- Include unassigned holdings as `Unassigned`.
- Display value and percentage for each bucket.

The existing asset allocation and currency breakdown cards can remain. The bucket card becomes the user-defined allocation view, while the existing cards continue to answer built-in asset type and currency questions.

If no holdings exist, keep the current empty state. If holdings exist but no bucket assignments exist, the bucket card shows `Unassigned` as 100%.

## Error Handling And Edge Cases

- Missing bucket assignment: show `Unassigned`.
- Missing bucket record for an assignment: treat as `Unassigned` and allow cleanup on next write.
- Deleted bucket: remove assignment rows during delete.
- Missing `marketValue`: use the current fallback calculation.
- FX unavailable: follow existing overview warning/fallback behavior.
- Same stock symbol across multiple brokerage rows: use the same bucket assignment.
- Same symbol with different security type: keep separate via `secType:symbol`.
- Derivatives: exclude from v1 bucket assignment and bucket totals.

## Testing

Add focused tests for:

- Default bucket seeding/migration.
- Security key generation and same-symbol assignment reuse.
- Bucket creation and assignment persistence.
- Clearing an assignment.
- Deleting a bucket and returning holdings to `Unassigned`.
- Holdings filtering by bucket.
- Overview bucket aggregation.
- Overview aggregation respecting preferred currency conversion and fallback market value behavior.
- Profile backup export/import including buckets and assignments.
- Older v1-v3 backup imports preserving compatibility and leaving default buckets available.

## Later Phase: Custom Overview Visualisations

Do not build custom visualisations in this version.

The later phase can reuse bucket aggregation as one data source for configurable overview widgets. Candidate future widgets include:

- Bucket allocation donut or bar chart.
- Bucket x market matrix.
- Bucket x currency matrix.
- Custom cards selected by the user.
- Reorderable overview layout.

This design should avoid hard-coding bucket aggregation only inside one React component so future widgets can reuse the same calculation.
