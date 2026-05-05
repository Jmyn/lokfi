## 1. Type System — brokerage-core

- [x] 1.1 Add `FundDetailType` union type to `packages/brokerage-core/src/types.ts` (`DIVIDEND | DIVIDEND_TAX | TRADE | FEE | TRANSFER_IN | REBATE | CORP_ACTION`)
- [x] 1.2 Add `BrokerageFundDetail` interface to `packages/brokerage-core/src/types.ts` with fields: `id`, `source`, `rawType`, `classifiedType`, `symbol?`, `contractName?`, `amount`, `currency`, `action?`, `quantity?`, `price?`, `commission?`, `businessDate`, `segType?`
- [x] 1.3 Remove `fetchCorpActions()` and add `fetchFundDetails(since: Date): Promise<BrokerageFundDetail[]>` as a required method in `BrokerageProvider` interface in `packages/brokerage-core/src/provider.ts`
- [x] 1.4 Export new types from `packages/brokerage-core/src/index.ts`
- [x] 1.5 Rebuild `@lokfi/brokerage-core` package

## 2. Tiger Types — tiger-types.ts

- [x] 2.1 Add `TigerFundDetail` interface to `apps/web/src/lib/brokerage/tiger/tiger-types.ts` with fields: `id?`, `account`, `currency?`, `amount?`, `desc?`, `type?`, `contractName?`, `segType?`, `businessDate?`, `updatedAt?`, `transactionTime?`
- [x] 2.2 Rename existing `TigerCorpAction` comment section to reflect the broader fund_detail scope (or remove it and rely on `TigerFundDetail`)

## 3. Database — db.ts (v7 schema)

- [x] 3.1 Add `brokerageFundDetails` table declaration to `LokfiDatabase` class in `apps/web/src/lib/db/db.ts`
- [x] 3.2 Add v7 schema version with `brokerageFundDetails: 'id, source, classifiedType, symbol, businessDate'` index
- [x] 3.3 Import `BrokerageFundDetail` type from `@lokfi/brokerage-core` in db.ts

## 4. Sync Adapter — dexie-sync-adapter.ts & sync-orchestrator.ts

- [x] 4.1 Add `appendFundDetails(actions: BrokerageFundDetail[]): Promise<void>` to `SyncDatabase` interface in `apps/web/src/lib/brokerage/sync-orchestrator.ts`
- [x] 4.2 Implement `appendFundDetails()` in `DexieSyncAdapter` (`apps/web/src/lib/brokerage/dexie-sync-adapter.ts`) using `this.db.brokerageFundDetails.bulkPut()`
- [x] 4.3 Import `BrokerageFundDetail` type in both files
- [x] 4.4 Add `fund_details` to `SyncCategory` type in `packages/brokerage-core/src/types.ts` (union: `'positions' | 'transactions' | 'corp_actions' | 'account' | 'fund_details'`)
- [x] 4.5 Add `fund_details` rate limit (1100ms — same Medium tier) to `RATE_LIMITS` in `sync-orchestrator.ts`
- [x] 4.6 Add `fund_details` case in `syncCategory()` switch with `syncFundDetailsWithRetry(since)`
- [x] 4.7 Implement `syncFundDetailsWithRetry()` private method calling `provider.fetchFundDetails(since)` then `db.appendFundDetails()`
- [x] 4.8 Add `fund_details` to default sync categories array and `getSyncStatus()` result map. Remove `corp_actions` from both.
- [x] 4.9 Rebuild `@lokfi/brokerage-core` after SyncCategory change

## 5. Tiger Provider — tiger-provider.ts

- [x] 5.1 Add `import type { BrokerageFundDetail }` (replacing `BrokerageCorpAction` import where applicable)
- [x] 5.2 Implement paginated `fetchFundDetails(since: Date): Promise<BrokerageFundDetail[]>` method:
- [x] 5.3 Remove `fetchCorpActions()` method from `TigerProvider` entirely (breaking change — replaced by `fetchFundDetails()`)
- [x] 5.4 Refactor `fetchTransactions()` to collect and return filled order data in a structure usable by the enrichment step (expose filled orders for enrichment matching)

## 6. Tiger Adapter — tiger-adapter.ts

- [x] 6.1 Create static `FUND_TYPE_MAP` constant mapping Tiger type strings to `FundDetailType` enum values
- [x] 6.2 Implement `classifyFundType(rawType?: string): FundDetailType` helper using the map, falling back to `FEE` with warning log for unknowns
- [x] 6.3 Implement `extractSymbolFromDesc(desc?: string): string` — extract first word as symbol (reuse existing `parseSymbolFromDesc` logic)
- [x] 6.4 Implement `extractActionFromDesc(desc?: string): TradeAction | undefined` — parse "Buy"/"Sell" prefix
- [x] 6.5 Implement `adaptFundDetail(raw: TigerFundDetail): BrokerageFundDetail | null`:
- [x] 6.6 Remove `adaptCorpAction()` from tiger-adapter.ts (no longer needed)

## 7. Trade Enrichment — tiger-adapter.ts or new enrichment module

- [x] 7.1 Implement `enrichTradeFundDetail(fd: BrokerageFundDetail, filledOrders: BrokerageTransaction[]): BrokerageFundDetail`:
- [x] 7.2 Integrate enrichment into `fetchFundDetails()` in `TigerProvider`:
- [x] 7.3 Modify `fetchTransactions()` return to also expose filled orders for enrichment (or have `fetchFundDetails()` fetch its own filled orders)

## 8. Unified View — unifiedTransactions.ts

- [x] 8.1 Extend `BrokerageRowType` with `'DIVIDEND_TAX'`, `'TRANSFER_IN'`, `'REBATE'`
- [x] 8.2 Implement `mapFundDetail(d: BrokerageFundDetail): UnifiedTransactionRow[]`:
- [x] 8.3 Update `filterBrokerageRow()` to pass through `DIVIDEND_TAX`, `TRANSFER_IN`, `REBATE`, `FEE` row types (no symbol/account filter needed — those are bank-only)
- [x] 8.4 Update `fetchUnifiedRows()` to query `db.brokerageFundDetails` (replacing `db.brokerageCorpActions`) and call `mapFundDetail()`
- [x] 8.5 Implement dedup logic: filled orders that have been matched to a fund_detail TRADE record SHALL NOT produce separate BUY/SELL rows
- [x] 8.6 Update `useUnifiedTransactions()` React hook dependency list (no functional change needed if `fetchUnifiedRows()` abstracts it)

## 9. CDC Stub — cdc-stub.ts

- [x] 9.1 Add `fetchFundDetails()` implementation to `CdcStubProvider` returning `[]` (required by updated `BrokerageProvider` interface)

## 10. Profile Export/Import — ProfilePage.tsx

- [x] 10.1 Add `brokerageFundDetails` to the export: add `db.brokerageFundDetails.toArray()` to the `Promise.all` in `handleExport()`, include in the data object, bump `version` to `3`
- [x] 10.2 Add `brokerageFundDetails` to import validation: accept v1, v2, and v3. For v3, require the `brokerageFundDetails` array. For v2, `brokerageFundDetails` is optional.
- [x] 10.3 Add `brokerageFundDetails` to import confirmation dialog: show "• N fund detail(s)" in the summary
- [x] 10.4 Add `brokerageFundDetails` to import restore: include in `tables` array, clear on import, `bulkAdd` from backup data
- [x] 10.5 Add `brokerageFundDetails` to `BrokerageSettingsPage.tsx` clear logic (line 177 — clear alongside other brokerage tables)

## 11. Component References — switch brokerageCorpActions → brokerageFundDetails

- [x] 11.1 Update `DividendsTab.tsx:52` — query `db.brokerageFundDetails.where('classifiedType').equals('DIVIDEND')` (also include `DIVIDEND_TAX` for comprehensive dividend view)
- [x] 11.2 Update `OverviewTab.tsx:326` — count `db.brokerageFundDetails` instead of `db.brokerageCorpActions`
- [x] 11.3 Update `TransactionsPage.tsx:76,83` — count `db.brokerageFundDetails` instead of `db.brokerageCorpActions`
- [x] 11.4 Update `TransactionFilters.tsx:23,29` — get unique sources from `db.brokerageFundDetails` instead of `db.brokerageCorpActions`

## 12. Tests

- [x] 12.1 Update `tiger-adapter.test.ts`: replace `adaptCorpAction` tests with `adaptFundDetail` tests covering all 13 types including Dividend Tax withheld, Dividend Tax refund (positive amount), Commission, Platform Fee, Trade, GST, Transfer In, Campaign Subsidy, unknown type
- [x] 12.2 Add trade enrichment tests: mock fund_detail + filled_orders, verify matching and enrichment logic
- [x] 12.3 Update `unifiedTransactions.test.ts`: replace `mapCorpAction` tests with `mapFundDetail` tests covering DIVIDEND, DIVIDEND_TAX withheld, DIVIDEND_TAX refund, TRADE (enriched and unenriched), FEE, TRANSFER_IN, REBATE
- [x] 12.4 Update `sync-orchestrator.test.ts`: verify `fund_details` category is synced, rate-limited, error-isolated; verify `corp_actions` category is removed from defaults
- [x] 12.5 Add pagination tests to `tiger-adapter.test.ts` or a new test file: mock multi-page fund_details responses, verify page exhaustion logic, verify inter-page delay
- [x] 12.6 Run full test suite: `pnpm test` to verify no regressions

## 13. Documentation

- [x] 13.1 Update `apps/web/src/lib/brokerage/tiger/README.md`:
- [x] 13.2 Update `apps/web/bin/test-tiger.ts` if it references `BrokerageCorpAction` or `adaptCorpAction`

## 14. Verification

- [x] 14.1 Run `pnpm build` to verify all packages compile
- [x] 14.2 Run `pnpm lint` to verify formatting/linting
- [x] 14.3 Run `pnpm test` and confirm all tests pass
- [x] 14.4 Manual verification: run the test script with Tiger credentials to confirm `fund_details ALL` returns expected data (deferred — requires Tiger credentials)
