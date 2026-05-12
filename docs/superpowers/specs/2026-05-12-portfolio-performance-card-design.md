# Portfolio Performance Card

**Date:** 2026-05-12
**Status:** Approved

## Overview

Replace the placeholder `PerformanceSparkline` component in the investments Overview tab with a real performance card that plots portfolio value over time using daily snapshots captured on every brokerage sync.

---

## 1. Database Schema

### New table: `portfolioSnapshots`

| Field | Type | Notes |
|---|---|---|
| `date` | string (YYYY-MM-DD) | Primary key — one row per calendar day |
| `totalValue` | number | Total portfolio value at time of snapshot |
| `currency` | string | Currency used (e.g. `"SGD"`) |

Using `date` as primary key means `db.portfolioSnapshots.put(snapshot)` deduplicates automatically — the latest sync of the day overwrites earlier ones.

**Dexie version:** bump from v9 → v10, adding `portfolioSnapshots` with index `date`.

---

## 2. Snapshot Capture

### `usePortfolioSnapshot` hook

A new React hook that writes a snapshot after every sync.

**Location:** `apps/web/src/lib/investments/usePortfolioSnapshot.ts`

**Behaviour:**
- Reads `positions` and `accounts` via `useLiveQuery`
- Accepts `fxRates` and `preferredCurrency` as parameters (passed down from the investments page, same as today)
- Computes `totalValue` using the same logic as `OverviewTab` (positions `marketValue ?? qty×avgCost` + account `cashBalance`, all converted to `preferredCurrency`)
- On change, writes `db.portfolioSnapshots.put({ date: today, totalValue, currency: preferredCurrency })`
- Today's date is `new Date().toISOString().slice(0, 10)`
- No debounce needed — Dexie `put` is idempotent and the same-day value will simply overwrite

**Called from:** `OverviewTab` (or the parent investments page), where `fxRates` and `preferredCurrency` are already available.

---

## 3. Performance Card UI

### Component: `PerformanceCard`

Replaces the existing `PerformanceSparkline` placeholder in `OverviewTab.tsx`.

**Location:** inline in `OverviewTab.tsx` (same file as other chart components).

**Layout:**

```
┌─────────────────────────────────────────────────┐
│ Performance          1M · 3M · 6M · 1Y · YTD · All │
│                                                 │
│  +12.4%                                         │
│  +SGD 4,200                                     │
│                                                 │
│  [area chart — portfolio value over time]       │
└─────────────────────────────────────────────────┘
```

**Time range options:** `1M`, `3M`, `6M`, `1Y`, `YTD`, `All`. Default: `1Y`.

**Return summary:**
- `returnPct = (latest - first) / first * 100`
- `returnAbs = latest - first`
- Displayed in green (`text-emerald-*`) if positive, red (`text-red-*`) if negative

**Chart:**
- Recharts `AreaChart` with `ResponsiveContainer`
- x-axis: date labels (auto-thinned by Recharts)
- y-axis: hidden (value readable from tooltip)
- Tooltip: uses `TOOLTIP_STYLE`, shows date + formatted value
- Area fill: accent colour with low opacity

**Currency conversion:**
- At render time, each snapshot value is converted to `preferredCurrency` using current `fxRates` via `convertAmount(snapshot.totalValue, snapshot.currency, preferredCurrency, fxRates)`
- If `preferredCurrency === 'Original'` or `fxRates` is null, values are used as-is

**Empty / insufficient data state:**
- Fewer than 2 snapshots in the selected range: show "Sync again to start building history" (no chart rendered)
- The time range pills are still shown so users can explore

---

## 4. Backup / Export / Import

### Version bump: v4 → v5

**`LokfiBackup` interface** — add field:
```ts
portfolioSnapshots: unknown[]
```

**`BACKUP_VERSION`** — change from `4` to `5`.

**`validateBackupShape`** — v5 requires `portfolioSnapshots` to be a present, non-null array.

**`normalizeBackup`** — v4 and older backups default `portfolioSnapshots` to `[]`.

**`buildBackupPayload`** — include `db.portfolioSnapshots.toArray()` in the `Promise.all`.

**`importBackupPayload`** — if `data.portfolioSnapshots.length`, call `db.portfolioSnapshots.bulkAdd(...)`.

**`buildImportSummary`** — add line: `• N portfolio snapshot(s)`.

---

## 5. Out of Scope

- Retroactive snapshot reconstruction from transaction history
- Per-account performance breakdown
- Benchmark comparison (e.g. S&P 500)
- Annualised return (XIRR / TWR)
