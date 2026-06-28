Review: CDC Cost-Basis Tracking Proposal

## Overall Assessment

The architecture is sound and correctly scoped. The core insight — freeze the opening remainder at a deterministic price, let the user optionally pin a per-unit cost — is the right complexity level. The heavier alternatives (lot ledger, CSV importer) are correctly deferred.

However, there are **two implementation-blocking gaps** and several clarity issues that need resolution before implementation.

---

## Issues

### 1. CRITICAL — `reconcile()` unconditionally overrides quality to `'incomplete'`

**`spot-cost-basis.ts:198`:**
```ts
basisQuality: 'incomplete',  // ← always, even with a valid market-derived price
```

The proposal states `reconcile` should produce `estimated` (valid anchor price) or `incomplete` (null price), plus `manual` when an override exists. But `reconcile` currently hardcodes `'incomplete'` on every correction — **including validly-priced corrections**. The enrichment pipeline's quality will always be `'incomplete'` regardless of how the opening remainder is priced, unless this is changed.

The fix: pass `openingPrice` into `reconcile`, and when it's non-null on a positive diff, degrade to `'estimated'` rather than `'incomplete'`. Preserve `'incomplete'` when `openingPrice` is null or the state was already `'incomplete'`. The `'manual'` tier should be set by the enrichment caller post-reconcile.

**Existing tests that will break:** `spot-cost-basis.test.ts:110` (valid price → currently asserts `'incomplete'`, should become `'estimated'`), plus lines 119 and 128 need review.

### 2. HIGH — Backup/restore integration is entirely missing

The proposal adds a durable `costBasisOverrides` table but tasks.md has **zero backup-related steps**. Looking at the backup system at `backup.ts` (`BACKUP_VERSION = 5`), a new table requires:

| Touch point | What's needed |
|---|---|
| `LokfiBackup` interface | Add `costBasisOverrides: unknown[]` |
| `BACKUP_VERSION` | Bump to 6 |
| `validateBackupShape` | Validate on v6+ |
| `normalizeBackupForImport` | Version-gate the field |
| `buildImportSummary` | Add line count |
| `buildBackupPayload` | `db.costBasisOverrides.toArray()` |
| `importBackupPayload` | Clear + `bulkAdd` |
| `db.ts` | Add `version(11).stores({ costBasisOverrides: 'securityKey' })` |

Without this, a user who exports and restores a backup loses all manually-set opening costs. The pattern to follow is `portfolioBucketAssignments` (v9 schema, backup v4).

### 3. MEDIUM — `estimated` diagnostic text collision

**`HoldingsTab.tsx:115-117`:**
```ts
basisQuality === 'estimated'
  ? ['Cost basis is partly estimated (deposits/rewards valued at market price on their event date).']
```

The proposal expands `estimated` to also mean "opening remainder at earliest-activity anchor." A holding with zero deposits but an anchored opening remainder would show this misleading text about deposits/rewards.

Task 3.2 says "Replace the amber estimate diagnostic with a neutral `Estimated` / `Manual` badge." If this means **removing** the text diagnostic entirely for `estimated` and using badges instead, that resolves the collision. The spec should be explicit about this. The `incomplete` diagnostic text can remain as-is.

### 4. MEDIUM — Sliding anchor on history expansion

If a user syncs 1 year of history (earliest date = Jan 2025), then later expands to 3 years (earliest date = Jan 2023), the anchor date shifts and the basis recomputes at a different price. This is "deterministic" but means a one-time shift that could confuse users. The design acknowledges this as a fallback case ("if anchor wobble ever proves material, persist the established estimate") but the tasks should at minimum include a code comment documenting the behavior.

### 5. LOW — `reconcile`'s quality on excess removal (diff < 0)

The proposal focuses on the positive-diff case (missing quantity). But `reconcile` also handles `diff < 0` (excess quantity stripped proportionally). In this case the opening price is irrelevant (no new units to price). The quality should remain whatever the caller sets. Currently fine, but worth a spec note.

---

## What's Well Done

- **Per-unit override** (not total): mathematically survives shrinking remainder as older trades sync in. The UI showing current opening quantity the per-unit cost applies to is the right transparency.
- **Earliest-activity anchor**: deterministic, disclosed as `estimated`, no storage needed.
- **Durable table pattern**: mirrors `portfolioBucketAssignments` — same identity keys, same survival rules.
- **Non-goals honored**: no CSV import, no lot ledger, no per-transfer editing. Scope is proportionate to the value.
- **Spec coverage**: scenarios cover drift-elimination, blending, override survival, revert-to-estimate, and the null-remainder inert case.

---

## Recommendations

1. **Add a task to modify `reconcile`'s quality logic** — accept `openingPrice`, degrade to `estimated`/`incomplete` accordingly. Update existing test assertions.
2. **Add backup/restore integration tasks** — bump `BACKUP_VERSION` to 6, wire through all touch points in `backup.ts` and `db.ts`.
3. **Clarify the `estimated` text replacement** — explicitly state the existing text diagnostic is removed and replaced by an `Estimated` badge.
4. **Document the anchor-shift behavior** — code comment + `investments.md` update describing the one-time basis shift when history window expands.
