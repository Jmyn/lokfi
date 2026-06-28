## Why

Users currently track bank transactions (spending, income) in Lokfi but have no visibility into their brokerage activity from Tiger Brokers or other brokerage. After completing the brokerage abstraction layer with Tiger OpenAPI, we need to surface synced brokerage data (trades, dividends, fees) in the UI. A unified timeline lets users see their complete financial picture — both spending and investing — in one place, which is the core value proposition of Lokfi.

## What Changes

- Add **Source Type tabs** (`All` | `Bank` | `Brokerage`) to the existing `/transactions` page filter bar
- Build a **`useUnifiedTransactions` hook** that queries `db.transactions` (bank) and `db.brokerageTransactions` + `db.brokerageCorpActions` (brokerage), merges them into a common row shape, sorts by date, and paginates
- Render **brokerage rows** in the existing `TransactionTable` with:
  - Formatted description: `"BUY AAPL — 10 shares @ $185.00"` or `"AAPL Dividend"` or `"Commission Fee"`
  - **Neutral gray** amount color for BUY/SELL (not red/green) to distinguish reallocation from spending
  - Source column enhanced with icon prefix: `📈 Tiger Brokers`
  - Category column shows `—` (no category interaction for brokerage rows)
  - Checkbox **disabled** for brokerage rows (no bulk select)
  - **Zero new table columns** — information density preserved
- Keep the **existing bank transaction table completely unchanged** when "Bank" or default view is active
- Add **contextual filters**: Type dropdown appears only when "Brokerage" tab is active; Category dropdown appears only when "Bank" tab is active
- Create a **`/settings/brokerage` page** for configuring brokerage accounts:
  - Credential input form (API key, secret, account ID) with encryption via `CredentialManager`
  - "Test Connection" button calling `provider.validateConnection()`
  - "Sync Now" button triggering `SyncOrchestrator.sync()`
  - **Configurable lookback days** for historical sync (default 90, stored in `db.settings`)
  - Sync status display and "Disconnect" action
- **No schema changes** to `DbTransaction`; no changes to rule engine, category system, or export logic
- **No duplicate records**: Brokerage data stays in its own Dexie tables; the unified view is computed at query time via the view layer

## Capabilities

### New Capabilities

- `unified-transaction-view`: Displaying brokerage transactions (BUY, SELL, DIVIDEND, FEE, CORP ACTION) alongside bank transactions in the existing `/transactions` page with tabbed filtering and merged pagination.
- `brokerage-ui-integration`: Reading synced brokerage data from Dexie (`brokerageTransactions`, `brokerageCorpActions`) and rendering it in UI components with proper formatting, icons, and visual distinction from bank data.
- `brokerage-settings`: Configuring brokerage API credentials, testing connections, triggering manual sync, and setting sync preferences including configurable lookback days.

### Modified Capabilities

- *(none — this is a purely additive change with no spec-level requirement changes to existing capabilities)*

## Impact

- **`apps/web/src/pages/transactions/`**: `TransactionsPage.tsx`, `TransactionTable.tsx`, `TransactionFilters.tsx`, `filterTypes.ts`
- **`apps/web/src/lib/db/db.ts`**: Potentially add `brokerageTransactions` and `brokerageCorpActions` to the Dexie schema if not already present (read-only, no migration needed for existing data)
- **`apps/web/src/layouts/AppShell.tsx`**: Add Portfolio icon to NAV_ITEMS (future — out of scope for Phase 1, but noted)
- **No API changes**, no backend changes, no breaking changes to existing bank transaction UX
