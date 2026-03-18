# Lokfi — Architecture Document

> Version 1.1 · March 2026 · Jermyn & Claude

---

## 1. Project Overview

**Lokfi** is a local-first, privacy-first personal finance tracker that parses bank statements from Singapore financial institutions, categorises transactions using a rule engine, and provides analytics and insights — all entirely on the user's device with no server, no account, and no cloud.

The name combines **local** + **finance** (lo-fi aesthetic, indie OSS spirit).

---

## 2. Guiding Principles

| Principle | What it means |
| --------- | ------------- |
| **Local-first** | All data lives on the user's device. No sync server, no auth, no cloud dependency. |
| **Privacy by design** | Zero telemetry, zero analytics. The app never phones home. |
| **Open core** | Full source is MIT licensed and auditable. Revenue comes from packaged release convenience, not paywalling features. |
| **Parser extensibility** | The parser library is a standalone npm package, versioned independently, designed to accept community-contributed parsers. |
| **No install required (web)** | The web app runs in any modern browser with no CLI dependency. |

---

## 3. Monorepo Structure

```text
lokfi/
├── apps/
│   └── web/                        # Vite + React 19 web application
│       ├── src/
│       │   ├── routes/             # TanStack Router pages
│       │   ├── components/
│       │   ├── lib/
│       │   │   ├── db/             # Dexie.js database layer
│       │   │   ├── workers/        # Web Workers (PDF parsing)
│       │   │   └── rules/          # Rule engine
│       │   └── hooks/
│       ├── public/
│       └── package.json
│
├── packages/
│   ├── parser-core/                # Standalone npm package (@lokfi/parser-core)
│   │   ├── src/
│   │   │   ├── parsers/
│   │   │   │   ├── ocbc/
│   │   │   │   │   ├── ocbc-credit.parser.ts
│   │   │   │   │   └── ocbc-debit.parser.ts
│   │   │   │   ├── dbs/
│   │   │   │   │   ├── dbs-credit.parser.ts
│   │   │   │   │   └── dbs-debit.parser.ts
│   │   │   │   ├── uob/
│   │   │   │   │   ├── uob-credit.parser.ts
│   │   │   │   │   └── uob-debit.parser.ts
│   │   │   │   ├── citibank/
│   │   │   │   │   └── citibank-credit.parser.ts
│   │   │   │   ├── maybank/
│   │   │   │   └── cdc/
│   │   │   ├── types.ts            # Shared type system
│   │   │   ├── registry.ts         # Parser registry & bank auto-detection
│   │   │   └── index.ts            # Public API
│   │   └── package.json
│   │
│   └── parser-seed/                # Dev CLI: anonymise real PDFs for parser dev
│       ├── src/
│       │   └── index.ts
│       └── package.json
│
├── package.json                    # pnpm workspace root
├── pnpm-workspace.yaml
├── turbo.json                      # Turborepo build config
└── docs/
    ├── architecture.md             # This document
    ├── architecture_review.md
    ├── design.md
    └── action-plan.md
```

---

## 4. Package: `@lokfi/parser-core`

### Responsibility

Takes raw PDF text (extracted by `pdfjs-dist`) and produces structured transaction data. This is the **core technical moat** — each bank has its own statement format, and building a reliable parser for each requires actual statements and careful reverse engineering.

### Public API

```typescript
// Types
export type StatementSource = 'ocbc' | 'dbs' | 'uob' | 'citibank' | 'cdc' | 'maybank' | ...
export type StatementType   = 'credit' | 'debit'

export interface Transaction {
  date: string               // ISO 8601
  description: string
  transactionValue: number   // negative = outflow, positive = inflow
  balance?: number
}

export interface ConsolidatedTransaction extends Transaction {
  source: StatementSource
  accountNo: string
  hash: string
  // hash input: source + accountNo + date + transactionValue + description
  //   + balance (when available) OR + occurrenceIndex (when balance unavailable)
  // See: generateTransactionHash() and ADR-006
}

export interface StatementParser {
  parse(text: string): Statement
  detect(text: string): boolean   // returns true if this parser recognises the PDF
}

// Registry
export const ParserRegistry: Record<StatementSource, Partial<Record<StatementType, StatementParser>>>

// Auto-detect: try all parsers, return first match
export function detectParser(pdfText: string): StatementParser | null

// Hash generation for deduplication.
// occurrenceIndex: 0-based count of transactions with the same
// (source, accountNo, date, transactionValue, description) seen before this one
// within the same statement parse run. Used when balance is unavailable.
export function generateTransactionHash(
  tx: Omit<ConsolidatedTransaction, 'hash'>,
  occurrenceIndex?: number
): string
```

### Parser Interface Contract

Every parser implements `StatementParser`:

- `detect(text)` — lightweight heuristic (check for bank name, statement header keywords). Must be fast and non-throwing.
- `parse(text)` — extract all transactions. Throws `ParseError` on unexpected format.

### Versioning

- Independently versioned (semver).
- Published to npm as `@lokfi/parser-core`.
- Web app pins to a specific version in `package.json`.

### Deduplication Hash Strategy

The hash uniquely identifies a transaction for deduplication on import. The input to the hash function is:

```text
source + accountNo + date + transactionValue + description + (balance | occurrenceIndex)
```

**Priority:**

1. If the parsed `Transaction` includes a `balance` field, it is appended to the hash input. Running balances are unique per row on statements that expose them (OCBC debit, DBS debit).
2. If `balance` is unavailable (most credit card parsers), `occurrenceIndex` is used — a 0-based integer counting how many transactions with the identical `(source, accountNo, date, transactionValue, description)` tuple have already been seen within the same statement parse run. The first occurrence appends `_0`, the second `_1`, and so on.

**Collision behaviour:**
When the import pipeline finds an incoming hash already in the database, it does **not** silently drop the transaction. Instead it surfaces a "Potential duplicate" warning per transaction in the import result summary. The user may force-import via an "Import anyway" action on that row.

Silent drop only occurs when the hash AND the full field set are byte-for-byte identical (re-importing the exact same statement produces no noise).

### Parser Seed Utility

**Problem:** Community contributors cannot share real bank PDFs or raw text dumps to help develop parsers — these files contain PII (names, account numbers, real amounts).

**Solution:** `packages/parser-seed` — a dev-only CLI that takes a real PDF text dump (produced by `pdfjs-dist`) and outputs an anonymised version safe to commit.

Transformations applied:

- Account numbers: replaced with a stable fake of the same length and format
- Personal name fields: replaced with `REDACTED_NAME`
- Dates: shifted uniformly by a random offset (±0–90 days) — preserves relative ordering and column layout
- Transaction amounts: fuzzed by ±5–15% — preserves sign, order-of-magnitude, and structural layout
- Description strings: **preserved verbatim** — these are the merchant/reference strings that parsers key on

**Usage (dev only — not shipped to end users):**

```bash
pnpm --filter @lokfi/parser-seed run seed --input ./raw-statement.txt --output ./fixtures/dbs-credit-sample.txt
```

The resulting fixture file is safe to commit under `packages/parser-core/src/parsers/<bank>/__fixtures__/` for parser unit tests. See also: **ADR-010**.

---

## 5. App: `apps/web`

### Tech Stack

| Layer | Choice | Rationale |
| ----- | ------ | --------- |
| Framework | Vite + React 19 | See ADR-007; lighter, faster, Tauri-native |
| Routing | TanStack Router v1 | File-based, fully type-safe, client-only |
| UI | shadcn/ui + Tailwind CSS | Accessible, unstyled-first components |
| State | React Context + Dexie.js hooks | Local DB as source of truth; no server state needed |
| Tables | TanStack Table v8 | Excellent virtual scrolling |
| Charts | Recharts | Replaces MUI x-charts; fully responsive SVG |
| Forms | react-hook-form + Zod | Validation at the form boundary |
| Theming | next-themes | Works standalone (no Next.js required since v0.3) |
| Storage | Dexie.js (IndexedDB) | Replaces localStorage; see Section 6 |
| PDF parsing | pdfjs-dist (Web Worker) | See Section 7 |
| Desktop wrapper | Tauri (Phase 4) | See Section 9 |

### Page Structure

```text
/                       # Landing / onboarding
/import                 # PDF drag-and-drop import
/transactions           # Transaction table with filters
/transactions/rules     # Rule engine management
/stats                  # Charts and analytics
/dashboard              # Summary cards + insights
/profile                # Export / import / settings
```

### Why Vite over Next.js

The original architecture targeted Next.js 15 App Router. This was reconsidered for three reasons:

1. **Tauri compatibility without constraints.** Tauri's WebView renders a static build. Next.js requires `output: 'export'` for this, which disables Server Actions, `headers()`/`cookies()`, and API routes — creating a permanent footgun. Vite builds static assets by default; no config workaround needed and no risk of accidentally using server-only APIs.

2. **Web Workers work natively.** Vite resolves `new Worker(new URL('./pdf-worker.ts', import.meta.url), { type: 'module' })` correctly in both development and production. No `postinstall` copy scripts or build-tool-specific hacks required (see Section 7).

3. **No Server/Client Component overhead.** Lokfi is fully client-side by design — all data flows through Dexie.js in the browser. The RSC model adds complexity (double bundle, Server/Client boundary rules) with zero benefit for this use case.

See **ADR-007**.

---

## 6. Data Layer: IndexedDB via Dexie.js

### Why Dexie over localStorage

localStorage has a ~5MB cap per origin, no indexing, and synchronous I/O that blocks the main thread. A year of transactions from 4 bank accounts can easily exceed this. IndexedDB is async, supports hundreds of MB, and can be queried by indexed fields.

### Database Schema (`lokfi-db` v2)

```typescript
import Dexie, { Table } from 'dexie'

export interface DbTransaction {
  id: string              // UUID (same as hash)
  hash: string            // dedup key
  source: StatementSource
  accountNo: string
  date: string            // ISO 8601 YYYY-MM-DD
  description: string
  transactionValue: number
  balance?: number
  category?: string       // set by rule engine (general rules)
  manualCategory?: string // set directly by user action; overrides rule engine
  importedAt: string      // ISO 8601 timestamp
}

// manualCategory takes precedence over category in all display and analytics logic.
// When manualCategory is set, rule engine output is stored in category but ignored.

export interface DbRule {
  id: string
  name: string
  priority: number        // lower = applied first
  conditions: RuleCondition[]
  category: string        // category id
  // isPinned removed — see ADR-009
  createdAt: string
}

export interface RuleCondition {
  field: 'description' | 'source' | 'accountNo' | 'transactionValue'
  // 'hash' removed: hash-pinned rules abolished (ADR-009)
  operation: 'contains' | 'equals' | 'startsWith' | 'regex' | 'gt' | 'lt' | 'between'
  value: string | number | [number, number]
}

export interface DbCategory {
  id: string
  name: string
  color: string           // hex
  icon?: string           // lucide icon name
  isIncome: boolean       // used to split income vs expense in stats
}

export interface DbSetting {
  key: string
  value: string
}

// Well-known DbSetting keys:
//   'lastExportedAt'    — ISO 8601 timestamp of last profile export; absent if never exported
//   'storagePermission' — 'granted' | 'denied' | 'prompt'

export class LokfiDatabase extends Dexie {
  transactions!: Table<DbTransaction>
  rules!: Table<DbRule>
  categories!: Table<DbCategory>
  settings!: Table<DbSetting>

  constructor() {
    super('lokfi')
    this.version(1).stores({
      transactions: 'id, hash, source, accountNo, date, category, importedAt',
      rules: 'id, priority, category',
      categories: 'id, name',
      settings: 'key',
    })
    // v2: adds manualCategory index; isPinned no longer written or read on DbRule
    this.version(2).stores({
      transactions: 'id, hash, source, accountNo, date, category, manualCategory, importedAt',
    })
  }
}
```

### Profile Portability

The full profile (all tables) can be exported as a single JSON file and re-imported on any device. This preserves the existing privacy guarantee: user controls their data entirely.

### IndexedDB Persistence & Volatility

IndexedDB is classified as "best-effort" storage unless the origin explicitly requests persistence. In best-effort mode, browsers (especially Safari/iOS) may evict data under storage pressure or after extended inactivity.

Mitigations:

#### 1. `StorageManager.persist()` on app init

```typescript
if (navigator.storage?.persist) {
  const granted = await navigator.storage.persist()
  await db.settings.put({ key: 'storagePermission', value: granted ? 'granted' : 'denied' })
}
```

If `granted` is `false`, a dismissible one-time banner is shown: *"Your browser may clear app data under storage pressure. Export your profile regularly to avoid data loss."*

#### 2. Backup warning

`lastExportedAt` in `DbSetting` is updated on every profile export. On app init, if `lastExportedAt` is absent or older than 30 days, a persistent yellow banner appears on every page:

> "You haven't exported a backup in over 30 days. [Export now →]"

The banner dismisses automatically after a successful export.

---

## 7. PDF Parsing Pipeline (In-Browser)

### Current Problem

The Deno CLI runs outside the browser: users must (1) put PDFs in a specific folder, (2) run `deno task start` in terminal, (3) upload the output JSON. This is a hard blocker for non-technical users.

### Solution: pdfjs-dist + Web Worker

```text
User drops PDF(s)
       ↓
  [Main Thread]
  FileReader API → ArrayBuffer
       ↓
  Dispatch to Web Worker
       ↓
  [Web Worker] (non-blocking)
  pdfjs-dist.getDocument(buffer)
  → extract text per page → join
       ↓
  @lokfi/parser-core.detectParser(text)
  → matched parser.parse(text)
  → ConsolidatedTransaction[]
       ↓
  Post message back to main thread
       ↓
  Deduplicate against existing DB (by hash)
  → collisions: surface "Potential duplicate" warning per transaction
     (user can force-import or skip each one)
  → clean: "X new transactions imported"
       ↓
  Dexie.transactions.bulkAdd(newTransactions)
```

### Auto-detection

Each parser's `detect()` method is tried in order. The first to return `true` wins. Detection is based on text heuristics (e.g. "OCBC Bank Statement", "DBS Multiplier Account").

### Error Handling

- If no parser matches: surface "Unsupported statement format" with a link to file a GitHub issue.
- If parser throws: surface "Parse error — {bank} {type} statement" with the raw error for debugging.

### PDF.js Worker Configuration

With Vite, worker integration is straightforward — no build-tool workarounds required. See **ADR-007**.

**Integration pattern:**

```typescript
// src/lib/workers/pdf-worker.ts  (the worker file itself)
import * as pdfjsLib from 'pdfjs-dist'

// pdfjs-dist bundles its own worker; set the path relative to Vite's dev server
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()
```

```typescript
// src/lib/workers/usePdfWorker.ts  (consumer)
const worker = new Worker(
  new URL('./pdf-worker.ts', import.meta.url),
  { type: 'module' }
)
```

Vite resolves both `import.meta.url` references correctly in development (Vite dev server) and production (static build served from Tauri WebView). No `postinstall` copy scripts or webpack plugins required.

---

## 8. Rule Engine

### Execution Model

The rule engine applies categories using a **three-tier priority order**:

```text
1. Manual Override  (manualCategory on DbTransaction)
   ↓ if not set
2. General Rules    (DbRule records, ascending priority order)
   ↓ if no rule matches
3. Uncategorised    (category = undefined)
```

**Tier 1 — Manual Override:** `DbTransaction.manualCategory` is set directly when a user manually categorises a transaction (single edit or bulk action). It is never touched by the rule engine and wins unconditionally.

**Tier 2 — General Rules:** Rules are matched in ascending `priority` order. The first matching rule assigns `DbTransaction.category`. All conditions within a rule are evaluated as AND.

**Tier 3 — Uncategorised:** If no rule matches and no manual override is set, the transaction has no category.

**What changed from v1:**

- Hash-pinned rules (`DbRule.isPinned`) are abolished — see ADR-009.
- "Bulk categorise" sets `manualCategory` directly on each selected `DbTransaction` row. No rules are created.
- A "Create Rule for Similar Transactions" action is available as an explicit separate step in the bulk-categorise flow. It creates a general `contains` rule on the description — not a hash-pinned rule.

### Supported Operations (v2)

```typescript
type Operation =
  | 'contains'        // description.toLowerCase().includes(value)
  | 'equals'          // field === value (exact, case-insensitive)
  | 'startsWith'      // field.startsWith(value)
  | 'regex'           // new RegExp(value, 'i').test(field)
  | 'gt'              // transactionValue > value (amount operations)
  | 'lt'              // transactionValue < value
  | 'between'         // value[0] <= transactionValue <= value[1]
```

Multiple conditions within one rule are evaluated as **AND** (all must match).

### Rule Simulator (Phase 2)

Users with multiple rules at varying priority levels cannot intuitively tell which rule will fire for a given transaction, or why a transaction landed in an unexpected category.

The Rule Simulator is a text input on `/transactions/rules`:

- A field labelled "Simulate — paste a transaction description"
- Optional secondary fields: Source, Amount (to test numeric conditions)
- On submit, the engine runs full Tier 2 evaluation against the pasted input
- Output: ordered list of all matching rules, in evaluation order, with the winning rule highlighted. If no rule matches, shows "No rule matches — transaction would be Uncategorised."

The simulator runs entirely client-side against the in-memory rule set from Dexie. It reuses the same `evaluateRules(transaction, rules)` function used in the import pipeline.

---

## 9. Desktop Distribution: Tauri Wrapper (Phase 4)

### Approach

**Not a rewrite.** The Vite + React web app is embedded inside a Tauri shell as a compiled native application. Tauri renders the web app in a WebView with access to native OS APIs. Because Vite produces a standard static build, the web and desktop apps share an identical codebase with no per-target configuration required (see ADR-007).

### Why Tauri over Electron

- Binary size: ~5MB vs ~100MB
- Memory: Tauri uses the OS WebView (WebKit/Blink); Electron bundles Chromium
- Security: Rust-based IPC with explicit allowlisting

### Desktop-only Features

| Feature | Why Desktop |
| ------- | ----------- |
| **Folder watching** | Watch `~/Downloads` or a custom folder; auto-import new PDFs as they land. Needs filesystem access not available in the browser. |
| **Auto-update** | Tauri updater protocol. Seamless updates for non-technical users. |
| **Signed installer** | macOS notarization + Windows code signing. Required for "just works" download. |

### Distribution

- Free: GitHub Releases (unsigned, build yourself)
- Paid ($15 Gumroad): Pre-built signed installer for macOS + Windows, auto-updates

---

## 10. Key Architecture Decisions (ADRs)

### ADR-001: pnpm Monorepo with Turborepo

**Decision:** Single repo, pnpm workspaces, Turborepo for task orchestration.

**Rationale:** `parser-core` needs to be independently versioned and publishable, while sharing TypeScript config and tooling with `apps/web`. Turborepo caches build artifacts, making CI fast.

**Rejected alternatives:** Separate repos (drift risk, harder to keep types in sync), Nx (heavier config).

### ADR-002: pdfjs-dist for In-Browser PDF Parsing

**Decision:** Use Mozilla's `pdfjs-dist` to extract text from PDFs in the browser via a Web Worker.

**Rationale:** Eliminates the CLI step entirely. pdfjs-dist is the same engine as Firefox's PDF viewer — mature, well-tested, no WASM compilation step needed for text extraction.

**Rejected alternatives:** Server-side parsing (violates local-first principle), WebAssembly PDF libs (higher complexity, no clear advantage for text extraction).

### ADR-003: Dexie.js over localStorage

**Decision:** Use Dexie.js as an IndexedDB abstraction layer.

**Rationale:** localStorage is limited to ~5MB, synchronous, and has no query capabilities. Dexie adds a clean Promise/Observable API over IndexedDB with TypeScript generics.

**Rejected alternatives:** sql.js / SQLite WASM (heavier, more setup), raw IndexedDB (verbose, error-prone).

### ADR-004: MIT Open Core Monetisation

**Decision:** Full monorepo published as MIT. Revenue via pre-built signed Tauri installer on Gumroad ($15 one-time).

**Rationale:** Privacy-conscious users won't trust a product they can't audit. MIT builds trust and enables community parser contributions. Revenue model targets users who want convenience, not the source code.

**Rejected alternatives:** Donations (untenable against free VC-funded alternatives), SaaS subscription (antithetical to local-first).

### ADR-005: Recharts over MUI x-charts

**Decision:** Replace MUI x-charts with Recharts for the stats and dashboard pages.

**Rationale:** The existing MUI x-charts implementation is hardcoded to 1200×1200px. Recharts renders responsive SVG out of the box with `<ResponsiveContainer>`. It's also a lighter dependency.

**Rejected alternatives:** Victory, Nivo (heavier), D3 directly (too low-level for our use case).

### ADR-006: Deduplication Hash Enhancement — balance + occurrenceIndex

**Decision:** Extend `generateTransactionHash` to incorporate `balance` (when available) or `occurrenceIndex` (when balance is unavailable) as a tie-breaker for same-day identical transactions.

**Rationale:** The original hash `source + accountNo + date + transactionValue + description` is not injective: two $5.00 coffee purchases from the same merchant on the same day produce an identical hash, causing the second to be incorrectly treated as a duplicate. Real bank statements regularly contain such transactions. `balance` is preferred because running balances are unique per row. For parsers that don't surface balance (most credit card formats), `occurrenceIndex` counted within a single parse run provides uniqueness without additional data requirements.

**Collision behaviour:** When a hash collision is detected against an existing DB record, the transaction is not silently dropped. A "Potential duplicate" warning is surfaced per transaction, with a force-import option. Silent drop is reserved for byte-identical re-imports only.

**Rejected alternatives:** Row number from PDF (parser-implementation-specific), intraday timestamp (banks don't include these), UUID per import (breaks cross-import deduplication).

### ADR-007: Vite + React over Next.js

**Decision:** Use Vite + React 19 with TanStack Router v1 instead of Next.js 15 App Router.

**Rationale:** Lokfi is fully client-side by design — all data flows through Dexie.js in the browser. Next.js App Router adds RSC complexity, a mandatory `output: 'export'` footgun for Tauri, and unreliable worker resolution under Turbopack — none of which provide any benefit for a local-first app. Vite produces a standard static build that works identically for browser and Tauri targets without per-target configuration. Web Worker integration via `import.meta.url` is natively supported.

**Rejected alternatives:** Next.js with `output: 'export'` (perpetual footgun; risk of accidentally using server APIs during development), CRA (unmaintained), Remix (server-focused).

### ADR-008: pdfjs-dist Worker via import.meta.url (Vite-native)

**Decision:** Reference the pdfjs-dist worker using `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` and instantiate the PDF parsing worker with `new Worker(new URL('./pdf-worker.ts', import.meta.url), { type: 'module' })`.

**Rationale:** Vite resolves `import.meta.url`-based worker references correctly in both dev server and production static build, including inside Tauri's WebView. This is Vite's idiomatic worker pattern — no copy scripts, no CDN, no additional config.

**Rejected alternatives:** CDN-hosted worker (violates local-first; fails offline in Tauri), `postinstall` copy to `public/` (Turbopack workaround no longer needed), dynamic `workerSrc` string (fragile in production static builds).

### ADR-009: Replace Hash-Pinned Rules with manualCategory on DbTransaction

**Decision:** Remove `DbRule.isPinned` and the hash-pinned rule mechanism. Store manual categorisation directly as `manualCategory?: string` on `DbTransaction`. Rule engine execution order: Manual Override → General Rules → Uncategorised.

**Rationale:** The original design auto-created one `DbRule` record per manually categorised transaction via bulk-categorise. This has three failure modes: (1) rule bloat — a user categorising a year of transactions creates hundreds of single-transaction rules; (2) hard to undo — requires finding and deleting a specific pinned rule; (3) conceptual confusion — rules imply forward-looking automation, but hash-pinned rules are point-in-time overrides. Storing the override directly on the transaction is semantically correct, trivially reversible, and has zero performance impact.

**Migration (v1 → v2):** For each `isPinned = true` rule, find the matching transaction by hash and set `manualCategory` from the rule's `category`. Delete the pinned rule. Runs automatically in the Dexie `version(2)` upgrade hook.

**Rejected alternatives:** Capping pinned rules (user-hostile, doesn't address conceptual confusion), separate `DbOverride` table (unnecessary indirection).

### ADR-010: Parser Seed Utility for Community Contributions

**Decision:** Add `packages/parser-seed` — a dev-only CLI that transforms real bank PDF text dumps into anonymised fixture files safe to commit to the public repository.

**Rationale:** Parser quality depends on test fixtures that reflect real statement layouts. Real statements contain PII. Without a safe way to share test inputs, community contributors cannot verify parsers against realistic data. The seed tool removes PII while preserving structural properties (column alignment, keyword placement, date/amount formatting) that parsers depend on. Merchant/description strings are preserved verbatim as they are the primary parser targets.

**Scope:** Dev dependency only. Not shipped in `@lokfi/parser-core` or `apps/web`.

**Rejected alternatives:** Hand-authored synthetic fixtures (high effort; misses real edge cases), encrypted fixtures (prevents others from reading the test data).

---

## 11. Bank Parser Coverage Plan

| Bank | Debit | Credit | Priority | Notes |
| ---- | ----- | ------ | -------- | ----- |
| OCBC | ✅ | ✅ | Done | Migrate from Deno to parser-core |
| Citibank | — | ✅ | Done | |
| UOB | — | ✅ | Done | |
| CDC | ✅ | — | Done | |
| **DBS / POSB** | P0 | P0 | Phase 2 | Largest SG bank — no parser yet |
| **UOB debit** | P1 | — | Phase 2 | |
| **Maybank** | P1 | P1 | Phase 3 | |
| Standard Chartered | P2 | P2 | Phase 4 | |
| HSBC | P2 | P2 | Phase 4 | |
| GXS / Trust / Maribank | P3 | P3 | Future | Digital bank formats TBC |

---

## 12. Phase 5: P2P Sync (Future / Post-Launch)

### Motivation

Post-Phase 4, users with multiple devices have no sync path beyond manually exporting and importing the JSON profile. For a daily-driver expense tracker, this friction eventually pushes privacy-conscious users back to cloud-based alternatives.

### Approach: P2P via CRDT, No Central Server

A sync solution requiring a central server is incompatible with Lokfi's local-first principles. Any sync path must be fully peer-to-peer and opt-in.

Planned approach:

- Use a CRDT library — **Yjs** or **Automerge** — to represent the Dexie tables as a mergeable document
- The user generates a **Sync Key** (256-bit random secret, displayed as a QR code or passphrase) on one device
- The second device enters the Sync Key to join the sync group
- Peer discovery uses a stateless WebRTC signalling server (only ICE candidates transit it — no user data)
- After initial connection, devices sync directly over WebRTC data channels

Conflict resolution:

- `manualCategory` changes: last-write-wins (user intent is explicit)
- Rule changes: CRDT merge — concurrent edits to different rules merge cleanly; same-rule conflicts use last-write-wins
- New transactions from different imports: union by hash (deduplication prevents double entries)

### Constraints

- No central backup server. Losing the Sync Key ends the sync relationship; no data is lost on either device.
- This is explicitly **excluded from the Phase 1–4 roadmap**. It is documented here to confirm the architecture does not foreclose it and to rule out any future drift toward central-server sync.

See also: **Principle: Local-first** (Section 2).

---

*Last updated: March 2026 · v1.1 — addresses architecture review concerns (see `architecture_review.md`)*
