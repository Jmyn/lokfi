## 1. Research & Verify Schema

- [ ] 1.1 Inspect `apps/web/src/lib/db/db.ts` to confirm `brokerageTransactions`, `brokerageCorpActions`, `brokeragePositions`, `brokerageAccounts`, `brokerageCredentials`, `brokerageSyncLog`, and `settings` table schemas
- [ ] 1.2 Verify `BrokerageTransaction` and `BrokerageCorpAction` type definitions in `@lokfi/brokerage-core`
- [ ] 1.3 Confirm `DbTransaction` schema has not changed and all existing indexed fields remain compatible
- [ ] 1.4 Verify `SyncOrchestrator` constructor accepts `lookbackDays` and passes `since` date to provider methods

## 2. Create Unified Data Layer

- [ ] 2.1 Create `apps/web/src/lib/brokerage/unifiedTransactions.ts` with the `UnifiedTransactionRow` type definition
- [ ] 2.2 Implement `fetchBankRows(filters)` function querying `db.transactions` with existing filter logic
- [ ] 2.3 Implement `fetchBrokerageRows(filters)` function querying `db.brokerageTransactions` and `db.brokerageCorpActions`
- [ ] 2.4 Implement `mergeAndSortRows(bankRows, brokerageRows)` helper sorting by date descending
- [ ] 2.5 Implement `useUnifiedTransactions(filters, pageOffset, pageSize)` hook returning `{ rows, total, hasMore, isLoading }`
- [ ] 2.6 Add lazy-loading: only query brokerage tables when sourceType is "all" or "brokerage"
- [ ] 2.7 Write unit tests for mapper functions (BUY/SELL/DIVIDEND/FEE formatting, date sorting, pagination slicing)

## 3. Create Brokerage Settings Page

- [ ] 3.1 Create `/settings/brokerage` route and `BrokerageSettingsPage.tsx` component
- [ ] 3.2 Build `BrokerageCredentialForm` with inputs for API key, secret, account ID, and passphrase
- [ ] 3.3 Integrate `CredentialManager.store/retrieve/remove` for encrypted credential persistence
- [ ] 3.4 Add "Test Connection" button that constructs `TigerProvider` and calls `validateConnection()`
- [ ] 3.5 Add "Sync Now" button that reads credentials, constructs `SyncOrchestrator` with configured `lookbackDays`, and calls `sync()`
- [ ] 3.6 Add configurable lookback days input with quick-select presets (30, 90, 180, 365, All time)
- [ ] 3.7 Store `brokerage:tiger:lookbackDays` in `db.settings` (default: 90); read it on page load and pass to `SyncOrchestrator`
- [ ] 3.8 Display sync status section: last sync time per category, success/failure indicators, error messages
- [ ] 3.9 Add "Disconnect" button that removes credentials and wipes all `brokerage*` Dexie tables
- [ ] 3.10 Handle empty state: show "Connect your Tiger Brokers account to sync trades and dividends" when no credentials exist
- [ ] 3.11 Add loading and error states for all async actions (test connection, sync, disconnect)

## 4. Enhance TransactionTable for Brokerage Rows

- [ ] 3.1 Update `TransactionTable.tsx` to accept `UnifiedTransactionRow[]` instead of `DbTransaction[]`
- [ ] 3.2 Add source icon rendering: `🏦` for bank, `📈` for brokerage in the Source column
- [ ] 3.3 Implement brokerage row Description formatting: `"BUY AAPL — 10 shares @ $185.00"`, `"AAPL Dividend"`, `"Commission Fee"`
- [ ] 3.4 Implement conditional amount colors: neutral gray for BUY/SELL, green for DIVIDEND, red for FEE, existing red/green for bank
- [ ] 3.5 Disable checkbox for brokerage rows (visually present but non-interactive)
- [ ] 3.6 Disable category editing for brokerage rows (show `—` instead of `CategoryBadge`)
- [ ] 3.7 Ensure bank rows retain 100% of existing behavior (checkbox, category editing, colors, copy button)
- [ ] 3.8 Handle empty state for brokerage tab: "No brokerage transactions yet. Sync your account to see trades and dividends."

## 5. Add Source Type Tabs & Contextual Filters

- [ ] 5.1 Add `sourceType: 'all' | 'bank' | 'brokerage'` to `Filters` type in `filterTypes.ts`
- [ ] 5.2 Create `SourceTypeTabs` component with `All | Bank | Brokerage` tabs, styled to match existing UI
- [ ] 5.3 Integrate `SourceTypeTabs` into `TransactionsPage.tsx` header area (above `TransactionFilters`)
- [ ] 5.4 Make `TransactionFilters` contextual: hide Category dropdown when `sourceType === 'brokerage'`, hide Type dropdown when `sourceType === 'bank'`
- [ ] 5.5 Add `type` filter field to `Filters` for brokerage types (BUY, SELL, DIVIDEND, FEE, CORP ACTION)
- [ ] 5.6 Update `TransactionFilters` to show Type dropdown only when relevant
- [ ] 5.7 Wire `SourceTypeTabs` state into `useUnifiedTransactions` hook

## 6. Update TransactionsPage Orchestration

- [ ] 6.1 Replace `useLiveQuery(db.transactions...)` with `useUnifiedTransactions` in `TransactionsPage.tsx`
- [ ] 6.2 Ensure pagination (pageOffset, PAGE_SIZE) works correctly across merged results
- [ ] 6.3 Update `totalCount` display to show combined total when "All" tab is active
- [ ] 6.4 Update `uncategorisedCount` to exclude brokerage rows (they have no category)
- [ ] 6.5 Disable bulk category bar for brokerage-only selections
- [ ] 6.6 Ensure rule suggestion system (`suggestRules`) is not invoked for brokerage rows
- [ ] 6.7 Verify toast, modal, and error states work with unified data

## 7. Visual Polish & Consistency

- [ ] 7.1 Add subtle background tint for brokerage rows (e.g., `--bg-sidebar` vs `--bg`) if design review approves
- [ ] 7.2 Ensure mobile responsiveness: tabs wrap, description truncates gracefully
- [ ] 7.3 Verify dark mode compatibility for all new elements
- [ ] 7.4 Check that `tab-nums` font variant is used for brokerage amounts
- [ ] 7.5 Ensure amber accent color is not overused — brokerage rows should feel distinct, not emphasized

## 8. Testing & Validation

- [ ] 8.1 Test with empty brokerage data: verify Bank tab works exactly as before
- [ ] 8.2 Test with empty bank data: verify Brokerage tab shows only brokerage rows
- [ ] 8.3 Test "All" tab with mixed data: verify correct sort order, pagination, and row counts
- [ ] 8.4 Test filter interactions: date range, source pills, category dropdown, type dropdown
- [ ] 8.5 Test bulk select: verify only bank rows can be selected
- [ ] 8.6 Test category editing: verify only bank rows open the combobox
- [ ] 8.7 Test settings page: credentials save/load, test connection, sync, disconnect, lookback days persist
- [ ] 8.8 Run existing test suite: `pnpm test` must pass without regression
- [ ] 8.9 Run linter: `pnpm lint` must pass

## 9. Documentation & Handoff

- [ ] 9.1 Add JSDoc to `useUnifiedTransactions` hook and mapper functions
- [ ] 9.2 Update `docs/portfolio-design-v1.md` to reflect Phase 1 implementation decisions
- [ ] 9.3 Add a brief note to `apps/web/README.md` (or relevant doc) about the unified transaction view and brokerage settings
- [ ] 9.4 Run `openspec apply` to mark tasks complete and archive the change
