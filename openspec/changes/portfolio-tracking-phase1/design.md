## Context

Lokfi is a personal finance app with a warm minimal aesthetic (amber accents, card-based UI, Tailwind CSS, Recharts). It currently tracks bank statement transactions imported from PDFs. The brokerage abstraction layer is complete — Tiger Brokers API syncs positions, transactions, corporate actions, and account data to Dexie (`brokerageTransactions`, `brokerageCorpActions`, `brokeragePositions`, `brokerageAccounts`).

The existing `/transactions` page (`TransactionsPage.tsx`) shows a `TransactionTable` with columns: checkbox, Date, Description, Amount, Category, Source, Account. It uses Dexie React Hooks (`useLiveQuery`) for reactive queries, supports filtering by date/source/account/category, pagination (100 rows), bulk category selection, and rule suggestions.

The design docs (`docs/portfolio-design-v1.md`, `docs/portfolio-design-v2.md`) and an oracle review established that:
- A unified view of bank + brokerage transactions is valuable but must not break existing bank transaction UX
- Brokerage data must NOT be merged into the `transactions` table (schema/risk reasons)
- The unified view should be computed at query time from separate Dexie tables
- Phase 1 should be display-only, additive, and shippable in one PR

## Goals / Non-Goals

**Goals:**
- Users can see brokerage transactions (BUY, SELL, DIVIDEND, FEE, CORP ACTION) alongside bank transactions in a single timeline
- Users can filter the view by source type: All, Bank-only, or Brokerage-only
- Brokerage rows are visually distinct from bank rows (icon, color, disabled interactions)
- Zero impact on existing bank transaction workflows (categorization, rules, bulk select, export)
- The unified query layer handles merging, sorting, and pagination across two Dexie tables

**Non-Goals:**
- No new table columns (Symbol, Qty, Price are rendered inline in Description)
- No schema changes to `DbTransaction` or the rule engine
- No category editing, bulk select, or rule suggestions for brokerage rows
- No dividend-to-bank-transaction linking or income categorization in Phase 1
- No FX rate conversion in Phase 1 (amounts shown in original currency)
- No Portfolio page or navigation changes (those are Phase 2+)
- No auto-sync scheduling or multiple accounts per brokerage in Phase 1

## Decisions

### 1. Separate Tables + View Layer (Not Merged Schema)
**Decision**: Keep `db.transactions` (bank) and `db.brokerageTransactions` + `db.brokerageCorpActions` (brokerage) as separate tables. Build a `useUnifiedTransactions` hook that queries both, maps to a common `UnifiedRow` shape, merges, sorts, and paginates in JavaScript.

**Rationale**:
- Merging brokerage into `transactions` would break Dexie indexed queries (`date`, `source`, `accountNo`, `category`), the rule engine, and `hash`-based deduplication
- The existing `TransactionTable.tsx` already fetches all filtered results and slices in-memory (line 72-73), so cross-table pagination is a small step
- Separate tables let each domain evolve independently

**Alternative considered**: Merge into `transactions` with nullable fields and a `transactionSource` discriminator. Rejected due to high regression risk and schema migration complexity.

### 2. No New Columns — Inline Description Formatting
**Decision**: Render brokerage details (symbol, qty, price) inside the existing Description column instead of adding Symbol/Qty/Price columns.

**Rationale**:
- Bank transactions are 90%+ of rows for most users; dead columns create visual noise
- The existing 7-column table is already dense; adding 3+ columns would break mobile layouts
- Inline formatting is consistent with the app's minimal aesthetic

**Format**:
- BUY/SELL: `"BUY AAPL — 10 shares @ $185.00"` or `"SELL NVDA — 5 shares @ $245.00"`
- DIVIDEND: `"AAPL Dividend — $12.50"`
- FEE: `"Commission Fee — $1.50"`
- CORP ACTION: `"AAPL Put Assignment — $500 premium"`

### 3. Neutral Amount Color for BUY/SELL
**Decision**: Render brokerage BUY/SELL amounts in neutral gray (not red/green). DIVIDEND in green, FEE in red.

**Rationale**:
- BUY/SELL are asset reallocations, not spending/income. Red/green implies cash flow impact which is misleading when mixed with bank transactions
- Neutral color signals "this is different" without implying loss/gain
- Bank transactions retain their existing red/green semantic meaning

### 4. Contextual Filters
**Decision**: The filter bar adapts based on the active Source Type tab.

**Rationale**:
- Category filter is irrelevant for brokerage; Type filter is irrelevant for bank
- Showing both simultaneously creates filter hell (7+ filter groups)
- Contextual filters keep the bar at 4-5 groups max

**Behavior**:
| Tab | Active Filters |
|-----|---------------|
| All | Date range, Source pills (all), Category dropdown, Type dropdown |
| Bank | Date range, Source pills (banks only), Category dropdown |
| Brokerage | Date range, Source pills (brokerages only), Type dropdown |

### 5. Disabled Interactions for Brokerage Rows
**Decision**: Checkboxes, category editing, and rule suggestions are disabled/hidden for brokerage rows.

**Rationale**:
- Brokerage transactions are read-only sync data; users shouldn't edit them
- Bulk category select applies only to bank transactions
- Rule engine is built for bank description patterns and would produce garbage for brokerage rows
- This is Phase 1; editable interactions can be added later if needed

### 6. Minimal Brokerage Settings Page
**Decision**: Add a `/settings/brokerage` page where users configure API credentials, test connection, trigger manual sync, and set sync preferences.

**Rationale**:
- Without a settings page, users have no way to populate brokerage data into the unified transaction view
- The existing infrastructure (`CredentialManager`, `dexie-credential-store`, `SyncOrchestrator`) already supports this; only UI is needed
- Keeping it minimal (one page, one brokerage for now) avoids scope creep

**What's in scope**:
- Credential input form (API key, secret, account ID) with validation
- "Test Connection" button calling `provider.validateConnection()`
- "Sync Now" button calling `SyncOrchestrator.sync()`
- Sync status display (last sync time, per-category success/failure)
- "Disconnect" action (clears credentials + wipes brokerage Dexie tables)

**What's out of scope**:
- Auto-sync scheduling, multiple accounts, CDC full implementation

### 7. Configurable Lookback Days for Sync
**Decision**: Users can configure how many days of historical transaction/corporate action data to sync (default: 90). Stored in `db.settings` as a key-value pair.

**Rationale**:
- `SyncOrchestrator` already accepts `lookbackDays` in its constructor (default 90)
- `TigerProvider` receives `since: Date` from the orchestrator, so the lookback is respected end-to-end
- `DbSetting` table already exists (`key: string, value: string`) — no schema changes needed
- Users have different needs: active traders may want 30 days, buy-and-hold investors may want 1-2 years

**Storage format**:
- Key: `brokerage:{source}:lookbackDays`
- Value: stringified integer (e.g., `"90"`)
- Default when missing: 90

**UI presentation**:
- Number input with quick-select presets: 30, 90, 180, 365, All time
- Label: "Sync history (days)"
- Helper text: "How far back to fetch transactions and corporate actions"

**Alternative considered**: Per-category lookback (e.g., positions = all time, transactions = 90 days). Rejected because the existing `SyncOrchestrator` uses a single `lookbackDays` for both `fetchTransactions` and `fetchCorpActions`. Can be extended later if needed.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| **Performance**: Querying two large Dexie tables and merging in JS could be slow for users with 10k+ bank transactions | Lazy-load brokerage queries only when "All" or "Brokerage" tab is active; cache results; add pagination at the query level before merging |
| **Cognitive overload**: Users may still confuse brokerage BUY amounts with bank spending despite neutral color | Make "Bank" the default tab; add prominent source icon; consider a subtle background tint for brokerage rows |
| **Mobile density**: Inline description formatting may wrap awkwardly on narrow screens | Use `whitespace-nowrap` for the formatted detail string; truncate with tooltip |
| **Future schema drift**: If `brokerageTransactions` schema changes, the `UnifiedRow` mapper breaks | Keep the mapper centralized in `useUnifiedTransactions`; add unit tests for mapping logic |
| **Missing data**: If brokerage sync hasn't run, the "Brokerage" tab shows empty — users may not understand why | Add an empty state with "No brokerage transactions yet. Sync your account in Portfolio settings." (Portfolio page is Phase 2, so this may need a temporary message) |

## Open Questions

1. Should the default tab be "All" or "Bank"? "Bank" preserves existing UX but hides the new feature. "All" showcases the feature but may confuse existing users.
2. Should we add a subtle background tint (e.g., `--bg-sidebar` vs `--bg`) for brokerage rows, or is the icon + neutral color sufficient?
3. What is the exact Dexie schema for `brokerageTransactions` and `brokerageCorpActions`? Need to verify field names before writing the mapper.
