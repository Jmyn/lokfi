## Why

The current portfolio transaction pipeline uses two separate Tiger API sources — `filled_orders` for trade execution data and `fund_details` (filtered to `CORPORATE_ACTION`) for dividends — but the `fund_details` endpoint with `fund_type: 'ALL'` returns a **complete cash ledger** of the brokerage account covering 13 distinct transaction types. By only requesting `CORPORATE_ACTION`, we silently drop 10 of those 13 types: Dividend Tax, Platform Fee, GST, Trading Activity Fee, SEC Fee, Option Regulatory Fee, Clearing Fee, Settlement Fee, Funds Transfer In, and Campaign Subsidy. This means the unified transaction view is missing deposits, fee rebates, and per-trade fee breakdowns that users can already see in their Tiger account statements.

## What Changes

- **BREAKING**: `fetchCorpActions()` in `TigerProvider` is replaced by a new `fetchFundDetails()` method that calls `fund_details` with `fund_type: 'ALL'` instead of `'CORPORATE_ACTION'`
- `TigerCorpAction` type is replaced by `TigerFundDetail` with the richer field set (`type`, `contractName`, `segType`, `updatedAt` in addition to existing fields)
- The adapter layer gains `adaptFundDetail()` handling all 13 fund_detail types, mapping them to appropriate unified transaction row types (DIVIDEND, FEE, TRANSFER, REBATE, etc.)
- Trade fund_detail records (type: "Trade") are enriched with quantity/price data from `filled_orders` to preserve per-share execution detail in the unified view
- `order_transactions` per-order detail (already fetched but currently discarded in `fetchTransactions`) is now utilized for enrichment
- A new `BrokerageFundDetail` normalized type is introduced in `@lokfi/brokerage-core` to represent fund_detail records (replacing `BrokerageCorpAction` in the pipeline)
- A new `brokerageFundDetails` Dexie table stores the comprehensive fund detail records
- The sync orchestrator gains `appendFundDetails()` and a `fund_details` sync category
- `unifiedTransactions.ts` gains `mapFundDetail()` replacing `mapCorpAction()`, handling all fund_detail types

## Capabilities

### New Capabilities
- `fund-detail-source`: Unified fund_detail pipeline that captures all 13 cash movement types from Tiger, replacing the limited CORP_ACTION-only approach. Includes type classification, fee tracking, transfer logging, and dividend tax visibility.
- `trade-enrichment`: Merging `filled_orders` quantity/price execution data into `fund_details` trade records so the unified view retains per-share detail while using a single cash-movement source of truth.

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **Affected code**: `tiger-provider.ts`, `tiger-adapter.ts`, `tiger-types.ts`, `sync-orchestrator.ts`, `dexie-sync-adapter.ts`, `db.ts`, `unifiedTransactions.ts`, `ProfilePage.tsx`, `DividendsTab.tsx`, `OverviewTab.tsx`, `TransactionsPage.tsx`, `TransactionFilters.tsx`, `BrokerageSettingsPage.tsx`, `cdc-stub.ts`, `brokerage-core/src/types.ts`, `brokerage-core/src/provider.ts`
- **Affected tests**: `tiger-adapter.test.ts`, `unifiedTransactions.test.ts`, `sync-orchestrator.test.ts`
- **Dependencies**: No new external dependencies; leverages existing `order_transactions` data that is already fetched but unused
- **Database migration**: New `brokerageFundDetails` Dexie table at v7 schema; existing `brokerageCorpActions` table becomes unwritten (retained for history)
- **Profile export format**: Bumped from v2 to v3 — `brokerageFundDetails` included in export dump, required in v3 import validation, optional in v2 imports for backward compatibility
- **Breaking**: `BrokerageProvider.fetchCorpActions()` is removed from the interface; any other provider implementations (e.g., CDC stub) must adopt `fetchFundDetails()`
