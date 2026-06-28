# Proposal: Cost-Basis Opening Cost (Crypto.com)

## Why

Crypto.com provides no cost basis for spot holdings, so the integration reconstructs it from synced trades and fills the unexplained remainder (the position held before the local ledger begins) with a synthetic adjustment priced at **current market**. That is both inaccurate — it ignores what you actually paid — and unstable: the basis drifts every time the price moves. Cost basis only affects the unrealized P&L/return figures (portfolio value and market value are price-driven and already correct), so the proportionate fix is small: stop the drift, and let the user optionally set what they paid for their opening position. A full lot ledger, history importer, and per-transfer editor were considered and rejected as over-engineered for the value — typing one number per holding is less effort, for the user and the codebase, than building and maintaining a CSV importer.

## What Changes

- **Freeze the opening estimate (fixes a drift bug).** Price the unexplained opening remainder once, at the **earliest-activity date's** market price, computed deterministically — instead of re-pricing at current market on every sync. Same inputs → same number → no drift. Flagged `estimated`.
- **Optional manual opening cost, blended.** Let the user set the **per-unit** cost of their opening position for a holding. The existing reconciliation already blends the opening lot with subsequent synced trades into a weighted average, so the manual value simply replaces the estimate as the opening lot's price; the displayed avg cost is the blend. Flagged `manual`.
- **Storage + UI.** A small durable table (keyed by security identity, surviving syncs like bucket assignments) holds the per-holding opening cost. The Holdings expanded row gains one "Initial cost per unit" field showing the opening quantity it applies to, and the basis-quality badge distinguishes `estimated` from `manual`.

Explicitly **not** in scope (deferred unless real use demands it): CSV/statement history import, an explicit per-lot ledger UI, a per-transfer editor, and a whole-position override for fully-tracked or Tiger holdings (which report their own avgCost).

## Capabilities

### New Capabilities

- `cost-basis-opening-cost`: Determine the cost of a holding's opening (untracked) position — a frozen, deterministic earliest-activity-date estimate by default, optionally overridden by a user-supplied per-unit cost — and blend it with synced trades via the existing weighted-average reconciliation. Includes the durable override store and the Holdings field/badge.

### Modified Capabilities

None.

## Impact

- **Modified code**: `apps/web/src/lib/brokerage/cdc/spot-cost-basis.ts` (`reconcile` takes the opening price from estimate/override instead of current market) and `cdc-basis-enrichment.ts` (resolve the earliest-activity anchor price, look up any manual override, set basis quality); `HoldingsTab.tsx` (the "Initial cost per unit" field + `estimated`/`manual` badge).
- **New code**: a small durable Dexie table (`costBasisOverrides`, added at `version(11)`) keyed by security key, never cleared by `clearBrokerageSourceData` (mirrors `portfolioBucketAssignments`); read/write helpers.
- **Backup/restore**: the new table must be wired into `backup.ts` (bump `BACKUP_VERSION` 5 → 6 and thread it through validate/normalize/summary/build/import) so overrides survive export→restore — a separate durability path from sync survival.
- **Database**: one tiny table; no change to existing brokerage tables.
- **Scope**: Crypto.com only — Tiger reports authoritative avgCost and never runs this engine. The estimate freeze is a behavior change (more accurate, stable) to existing CDC basis; the override is additive.
- **Non-goals honored**: no parser/importer to maintain, no new transaction sources, no lot-ledger abstraction.
