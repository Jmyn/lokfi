# Tasks: cdc-cost-basis-tracking

## 1. Engine — freeze the opening estimate

- [x] 1.1 Change `reconcile` in `spot-cost-basis.ts` to take an explicit `openingPrice` for the residual instead of pricing at current market; keep the existing blend + reconcile-to-authoritative behavior
- [x] 1.2 Make `reconcile`'s quality conditional (it currently hardcodes `'incomplete'` at line ~198): on a positive diff, `openingPrice` non-null → `estimated`, null → `incomplete`; on excess removal (diff < 0) preserve the incoming state's quality rather than forcing `incomplete` (no new units are priced there)
- [x] 1.3 In `cdc-basis-enrichment.ts`, resolve the earliest local activity date per token and look up its market price (`getDailyClose`) as the deterministic opening estimate; pass it as `openingPrice`. Add a code comment documenting the earliest-activity anchor (and that it can shift only if the history window later expands — not possible in the current API-only scope)
- [x] 1.4 Handle the no-local-events edge (price at earliest in-window date); keep `incomplete` when no price is available; map quality to the existing position-extension keys (the `manual` tier is set by the enrichment caller post-reconcile, see 2.3)
- [x] 1.5 Update existing `reconcile` tests in `spot-cost-basis.test.ts` (valid-price reconciliation currently asserts `incomplete` → must become `estimated`); add tests: no drift across repeated runs, remainder priced at earliest-activity date, blended average, no-remainder case, dust tolerance, and diff<0 quality preserved

## 2. Manual opening-cost override

- [x] 2.1 Add a durable `costBasisOverrides` Dexie table at `version(11).stores({ costBasisOverrides: 'securityKey' })` with `{ securityKey, unitCost, currency, note?, updatedAt }`; confirm `clearBrokerageSourceData` does NOT clear it
- [x] 2.2 Read/write helpers (get by securityKey, set, clear)
- [x] 2.3 In enrichment, resolve `openingPrice = manualOverride ?? earliestActivityEstimate`; set quality `manual` when the override is used
- [x] 2.4 Unit tests: override replaces estimate and blends, per-unit survives a shrinking remainder, override inert when no remainder, clear reverts to estimate, survives a simulated full resync (override table untouched by `clearBrokerageSourceData`)

## 3. Backup / restore integration

- [x] 3.1 `backup.ts`: add `costBasisOverrides: unknown[]` to `LokfiBackup`, widen the `version` union to include `6`, and bump `BACKUP_VERSION` to `6`
- [x] 3.2 `validateBackupShape`: require `costBasisOverrides` to be an array on `version >= 6`
- [x] 3.3 `normalizeBackupForImport`: version-gate the field (`version >= 6 ? data.costBasisOverrides : []`)
- [x] 3.4 `buildImportSummary` (add a count line), `buildBackupPayload` (`db.costBasisOverrides.toArray()`), and `importBackupPayload` (include the table in the rw transaction set, clear, and `bulkAdd`)
- [x] 3.5 Extend `backup.test.ts`: a backup round-trip preserves `costBasisOverrides`, and importing a pre-v6 backup defaults it to empty without error

## 4. UI + verification

- [x] 4.1 Add the "Initial cost per unit" field to the Holdings expanded row for CDC holdings with an opening remainder, showing the opening quantity it prices; save/clear wired to the override helpers
- [x] 4.2 In `HoldingsTab.tsx`, replace the `estimated` text diagnostic (the "deposits/rewards valued at market price…" line, which is misleading once `estimated` also means an anchored opening remainder) with a neutral `Estimated` / `Manual` badge driven by basis quality; keep the `incomplete` text; hide the field (or show "fully tracked from trade history") when there is no remainder
- [x] 4.3 Recompute basis on save and live-update Holdings/Overview via the existing Dexie live queries
- [x] 4.4 Full suite + lint + typecheck + production build green; update `apps/docs/guide/investments.md` to document the opening-cost field, the estimate/blend behavior, the `Estimated`/`Manual` badges, and the "weighted average, not tax-lot" caveat
