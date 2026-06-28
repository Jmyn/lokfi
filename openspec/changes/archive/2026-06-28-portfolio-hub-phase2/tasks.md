## 1. Navigation & Routing

- [x] 1.1 Add `Portfolio` to `NAV_ITEMS` in `AppShell.tsx` between Dashboard and Import with `TrendingUp` icon
- [x] 1.2 Create `/portfolio` route in `router.tsx` with `PortfolioPage` component
- [x] 1.3 Create `PortfolioPage.tsx` shell with tab state managed via URL query param (`?tab=`)
- [x] 1.4 Create tab navigation component: Overview | Holdings | Transactions | Dividends
- [x] 1.5 Check if any brokerage credentials exist (`db.brokerageCredentials.count() > 0`) on Portfolio page mount; show setup CTA if none
- [x] 1.6 Add "Brokerage Settings" icon button in Portfolio header linking to `/settings/brokerage`
- [x] 1.7 Display last sync timestamp in Portfolio header from `brokerageSyncLog` (most recent per source)
- [x] 1.8 Add "Sync Now" button in Portfolio header that triggers `SyncOrchestrator.sync()` with stored lookback days

## 2. FX Rate Infrastructure

- [x] 2.1 Add `fxRates` table to Dexie schema (v6 migration) with fields: `date`, `base`, `rates`
- [x] 2.2 Create `src/lib/fx/frankfurter-client.ts` with fetch function for latest rates
- [x] 2.3 Create `src/lib/fx/fallback-client.ts` with exchangerate-api fallback
- [x] 2.4 Create `src/lib/fx/cache.ts` with `getRates()`, `storeRates()`, and `isStale()` helpers
- [x] 2.5 Create `src/lib/fx/convert.ts` with `convertAmount(amount, from, to, rates)` utility
- [x] 2.6 Create `useFxRates()` hook that fetches on mount if stale, returns rates + lastUpdated + error state
- [x] 2.7 Write unit tests for FX conversion logic and caching behavior

## 3. Currency Selector & Preference

- [x] 3.1 Create `CurrencySelector` dropdown component with options: SGD, USD, HKD, Original
- [x] 3.2 Store `portfolio:preferredCurrency` in `db.settings` (default: SGD)
- [x] 3.3 Read preference on Portfolio page load and pass to all child tabs
- [x] 3.4 Show "Last updated: {date}" micro-text below the currency selector

## 4. Overview Tab

- [x] 4.1 Create `OverviewTab.tsx` with card-based layout
- [x] 4.2 Implement KPI cards: Total Portfolio Value, Day Change, Dividends YTD
- [x] 4.3 Compute total portfolio value from `brokeragePositions` market values + `brokerageAccounts` cash balances
- [x] 4.4 Compute day change from current vs previous sync snapshot (stored in `brokerageAccounts` history)
- [x] 4.5 Compute dividends YTD by filtering `brokerageCorpActions` for `type === 'DIVIDEND'` in current year
- [x] 4.6 Create `AllocationChart` donut chart using Recharts PieChart with inner radius
- [x] 4.7 Group positions by `secType` (STK, OPT, CASH, FUND, OTHER) for allocation
- [x] 4.8 Create `CurrencyBreakdown` component with mini progress bars per currency
- [x] 4.9 Create `PerformanceSparkline` area chart with time range toggle (1M, 3M, 6M, 1Y, YTD, All)
- [x] 4.10 Store historical portfolio snapshots in `brokerageAccounts` or compute from positions + transactions
- [x] 4.11 Handle empty state: "No portfolio data yet. Sync your brokerage account."
- [x] 4.12 Add loading skeletons for all cards while data loads
- [x] 4.13 Add "Connect Brokerage" CTA card when no credentials exist; links to `/settings/brokerage`

## 5. Holdings Tab

- [x] 5.1 Create `HoldingsTab.tsx` with search input and grouped table layout
- [x] 5.2 Query `db.brokeragePositions` and group by `currency`
- [x] 5.3 Create `HoldingsTable` with columns: Symbol, Qty, Avg Cost, Mkt Price, Mkt Value, P&L
- [x] 5.4 Compute Mkt Price: `marketValue / quantity` if `marketValue` exists, else fallback to `avgCost`
- [x] 5.5 Compute P&L: `(mktPrice - avgCost) × quantity`
- [x] 5.6 Color-code P&L: green for positive, red for negative
- [x] 5.7 Add collapsible currency group headers (USD Holdings, SGD Holdings)
- [x] 5.8 Add search filtering by symbol or name
- [x] 5.9 Create `HoldingDetailRow` expandable component with: full name, raw cost basis, day range, 52W range
- [x] 5.10 Add "View Transactions" and "View Corp Actions" buttons in expanded detail
- [x] 5.11 Handle empty state: "No holdings yet. Sync your account."

## 6. Transactions Tab (Portfolio Context)

- [x] 6.1 Create `PortfolioTransactionsTab.tsx` wrapping the existing unified transaction view
- [x] 6.2 Add Type badge column: BUY (green), SELL (red), DIVIDEND (amber), FEE (gray)
- [x] 6.3 Add Symbol column (blank for bank transactions)
- [x] 6.4 Add Quantity column (blank for bank and non-BUY/SELL)
- [x] 6.5 Add Price column (blank for bank and non-BUY/SELL)
- [x] 6.6 Add dividend-to-bank linking: detect matching bank transactions by amount + date proximity
- [x] 6.7 Show chain/link icon for linked dividends with navigation to the bank transaction

## 7. Dividends Tab

- [x] 7.1 Create `DividendsTab.tsx` with summary cards and chart layout
- [x] 7.2 Query `db.brokerageCorpActions` filtered by `type === 'DIVIDEND'`
- [x] 7.3 Compute YTD Total: sum of dividends in current calendar year
- [x] 7.4 Compute Monthly Average: `YTD Total / monthsWithDividends`
- [x] 7.5 Compute Yield on Cost: `annualizedDividends / totalCostBasis`
- [x] 7.6 Convert all metrics to preferred currency using cached FX rates
- [x] 7.7 Create `DividendBarChart` monthly grouped bar chart using Recharts BarChart
- [x] 7.8 Add year selector dropdown (current year and previous 4 years)
- [x] 7.9 Create `DividendTable` with columns: Symbol, Ex-Date, Pay Date, Amount, Currency, Type
- [x] 7.10 Add All | Paid | Estimated filter based on pay date
- [x] 7.11 Handle empty state: "No dividends recorded yet."

## 8. Currency Conversion Integration

- [x] 8.1 Apply currency conversion to all monetary values in Overview KPI cards
- [x] 8.2 Apply currency conversion to Holdings table Mkt Value and P&L
- [x] 8.3 Apply currency conversion to Dividends summary metrics
- [x] 8.4 Show original currency amount as secondary text when converted
- [x] 8.5 Handle missing FX rate gracefully (show original currency with warning)

## 9. Mobile & Visual Polish

- [x] 9.1 Make tab bar horizontally scrollable on narrow screens
- [x] 9.2 Stack KPI cards vertically on mobile
- [x] 9.3 Make Holdings table horizontally scrollable with sticky Symbol column
- [x] 9.4 Ensure donut chart legend wraps gracefully on mobile
- [x] 9.5 Verify dark mode compatibility for all new charts and cards
- [x] 9.6 Use `tab-nums` font variant for all monetary amounts
- [x] 9.7 Ensure amber accent is used sparingly — charts should use distinct color palette

## 10. Testing & Validation

- [x] 10.1 Test with empty portfolio data: all tabs show correct empty states
- [x] 10.2 Test with single-currency portfolio: currency breakdown shows one card
- [x] 10.3 Test FX rate fetch: verify Frankfurter API call and caching
- [x] 10.4 Test FX fallback: simulate Frankfurter failure, verify fallback API used
- [x] 10.5 Test currency conversion: verify SGD→USD and USD→HKD calculations
- [x] 10.6 Test tab deep-linking: `/portfolio?tab=holdings` opens correct tab
- [x] 10.7 Test sidebar active state: Portfolio highlighted when on `/portfolio`
- [x] 10.8 Test mobile responsiveness: all tabs usable at 375px width
- [x] 10.9 Run existing test suite: `pnpm test` must pass without regression
- [x] 10.10 Run linter: `pnpm lint` must pass

## 11. Documentation

- [x] 11.1 Add JSDoc to all FX utility functions and hooks
- [x] 11.2 Update `docs/portfolio-design-v1.md` to reflect Phase 2 completion
- [x] 11.3 Update `apps/web/README.md` with Portfolio page description
- [x] 11.4 Run `openspec apply` to mark tasks complete
