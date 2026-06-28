# Design: Cost-Basis Opening Cost

## Context

CDC spot basis is reconstructed by a pure event engine (`spot-cost-basis.ts`: BUY/SELL/DEPOSIT/WITHDRAWAL → weighted average), then `cdc-basis-enrichment.ts` calls `reconcile(computed, authoritativeQty, currentPrice)` to absorb the unexplained remainder. `reconcile` already **adds the residual quantity to the real-trade cost and returns the blended average** — so blending an opening lot with subsequent trades is existing behavior. The only defect is that the residual is priced at `currentPrice`, so basis drifts with the market every sync.

This change makes the residual's price stable and optionally user-set. It deliberately avoids the heavier alternatives (lot-ledger abstraction, CSV importer, per-transfer editor) that were judged over-engineered: cost basis only affects unrealized P&L figures, and for a handful of holdings a single typed number beats a maintained importer.

## Goals / Non-Goals

**Goals:**

- Stable (non-drifting) opening-position cost.
- Optional, minimal manual correction: one per-unit number per holding, blended automatically with synced trades.
- Reuse the existing reconcile/blend path; no new engine concepts.
- Durable override that survives sync, full resync, and disconnect/reconnect.

**Non-Goals:**

- CSV/statement history import.
- Explicit per-lot ledger or per-transfer editing UI.
- Whole-position override for fully-tracked or Tiger holdings (Tiger reports its own avgCost; defer).
- FIFO / specific-lot tax accounting.

## Decisions

### D1: Price the opening residual at the earliest-activity date, not current market

`reconcile` (or its caller) prices the unexplained remainder at the market price on the holding's **earliest local activity date** (earliest synced trade/transfer for that token), obtained from the candlestick lookup the enrichment already uses (`getDailyClose`). This is deterministic given stable data, so repeated syncs yield the same basis — no drift. Quality for an estimate-priced residual is `estimated`.

- *Anchor fallback*: if a token has no local events at all (a pure untracked holding), price at the earliest date available in the sync window. The result is flagged `estimated` regardless, so minor anchor variance for that edge case is disclosed, not hidden.
- *No persistence needed for the estimate*: determinism replaces storage. (If anchor wobble ever proves material, persisting the established estimate is the fallback — not done by default.)
- *Mechanism*: change `reconcile`'s price argument from "current market" to a resolved `openingPrice`, computed by the enrichment as `manualOverride ?? earliestActivityEstimate`.
- *Quality logic in `reconcile`*: `reconcile` currently hardcodes `basisQuality = 'incomplete'` on any correction. That breaks the quality tiers. The fix:
  - When `openingPrice` is non-null and the diff is positive: degrade to `estimated` (replace the hardcoded `'incomplete'`).
  - When `openingPrice` is null: preserve `'incomplete'` (as today — no price means we cannot even estimate).
  - When the incoming state is already `'incomplete'` (from an earlier event-engine degradation): preserve `'incomplete'` regardless of price validity.
  - `'manual'` quality is **not** set inside `reconcile`; the enrichment caller sets it after `reconcile` returns when an override is active.
- *Existing test impact*: `reconcile` tests that assert `'incomplete'` for a validly-priced correction must be updated to `'estimated'`.

### D2: Manual opening cost is a per-unit override fed into the same blend

The user sets a **per-unit** opening cost for a holding. The enrichment resolves the override (if present) as the `openingPrice` passed to `reconcile`; everything downstream (blend with real trades, reconcile to authoritative quantity, avg-cost display) is unchanged. Quality becomes `manual`.

- *Per-unit, not total*: as older trades get synced the opening residual shrinks; a per-unit cost stays valid while a total would silently break. The UI shows the current opening quantity the per-unit cost applies to.
- *Semantics*: the input is the **opening** cost, not the final average — the displayed avg cost is the blend and will differ once real trades mix in. UI labels accordingly.
- *No residual → override inert*: if a holding has no opening remainder (full history synced), there is nothing for the override to price; it has no effect. (A whole-position override for that case is a deferred non-goal.)

### D3: Durable override store keyed by security identity

A small Dexie table `costBasisOverrides` (added at `version(11)`, keyed by `getSecurityKey(position)` e.g. `CRYPTO:BTC`), holding `{ securityKey, unitCost, currency, note?, updatedAt }`. It is **not** cleared by `clearBrokerageSourceData`, so overrides survive full resyncs and disconnect/reconnect — exactly how `portfolioBucketAssignments` persists. Enrichment reads it; the Holdings field writes it.

The table MUST also be wired into the backup system (`backup.ts`), which is a **separate durability path** from sync survival: add it to `LokfiBackup`, bump `BACKUP_VERSION` 5 → 6, version-gate it in `validateBackupShape` / `normalizeBackupForImport`, and include it in `buildImportSummary` / `buildBackupPayload` / `importBackupPayload`. Without this, export→restore silently drops every override. `portfolioBucketAssignments` (schema v9 / backup v4) is the exact precedent to follow.

### D4: Recompute + quality surfacing

Basis recomputes after each sync and immediately after an override edit (the existing enrichment entry point). Basis quality (`ok` / `estimated` / `manual`; `incomplete` retained for missing-price cases) is written to the existing position-extension keys the Holdings row already reads, and the amber estimate diagnostic is replaced by a neutral `Manual` badge when an override is set.

*Prerequisite*: `reconcile`'s quality logic must be updated per D1 — it cannot unconditionally emit `'incomplete'` on reconciliation, or the `'estimated'` tier will never reach the extension store.

## Risks / Trade-offs

- **[Anchor determinism for untracked holdings]** A holding with no synced events has no natural earliest-activity date. → Use the earliest in-window date; result is flagged `estimated`; user can pin it with the override. Acceptable because it only affects the P&L figure, not portfolio value.
- **[User confusion: typed ≠ displayed]** The opening cost typed differs from the blended avg shown. → Clear labelling ("Initial cost per unit") and showing the opening quantity it prices; this is documented behavior, not a bug.
- **[Override on a fully-tracked holding does nothing]** If there is no residual, the override is inert. → UI hides/greys the field (or notes "fully tracked from trade history") when the opening quantity is ~0. Whole-position override remains a deferred non-goal.
- **[Estimate accuracy]** Earliest-activity price is a proxy for the true acquisition price. → It is explicitly an estimate (`estimated` badge); the override exists precisely to correct it when it matters.
- **[Anchor shifts on history-window expansion]** If the user initially syncs 1 year then later expands to 3 years, the earliest activity date moves earlier and the basis shifts once before stabilizing. → This is correct behavior (the new anchor is more accurate), but document it in the user guide so the one-time shift is expected, not alarming.

## Open Questions

- Whether to show the field at all when the opening residual is ~0 (lean toward hiding it with a "fully tracked" note).
- Whether `incomplete` (price-lookup failure) should also be user-correctable via the same field — likely yes, same mechanism, no extra work.

## Resolved / Out of Scope

- **Anchor shift on history-window expansion**: a concern only if the earliest-activity date moves materially. In the current API-only scope it does not — CDC's API is capped at ~180 days and the local store is append-only, so after first connect the earliest-activity date is effectively pinned (older trades never arrive via the API, and existing ones are never deleted). The window only expands via CSV import, which is a deferred non-goal. Captured as a code comment per D1; no persistence of the established estimate is needed now.
