# Portfolio Hub — Design Document

> Phase 2 completion · May 2026

## Overview

The Portfolio Hub (`/portfolio`) provides a dedicated, visually rich view of a user's brokerage holdings, transactions, and dividend income. It is the second phase of Lokfi's investment tracking capabilities, building on the unified transaction view from Phase 1.

## Architecture

### Navigation

- **Sidebar**: "Portfolio" item added between Dashboard and Import, using `TrendingUp` icon.
- **Routing**: `/portfolio` registered in TanStack Router with tab state managed via `?tab=` query parameter.
- **Deep-linking**: `/portfolio?tab=holdings` opens the Holdings tab directly.

### Page Structure

```
PortfolioPage
├── Header (title, currency selector, brokerage settings link)
├── Sync status bar (last sync timestamp, sync now button)
├── PortfolioTabs (Overview | Holdings | Transactions | Dividends)
└── Tab Content
    ├── OverviewTab
    ├── HoldingsTab
    ├── PortfolioTransactionsTab
    └── DividendsTab
```

### FX Rate Infrastructure

- **Primary API**: Frankfurter (`https://api.frankfurter.dev/v2/latest?from=USD`)
- **Fallback API**: open.er-api.com (`https://open.er-api.com/v6/latest/USD`)
- **Cache**: Dexie `fxRates` table (schema v6) with composite key `[date+base]`
- **Hook**: `useFxRates()` fetches on mount if stale, returns rates + lastUpdated + error
- **Utility**: `convertAmount(amount, from, to, rates)` handles cross-rate conversion via USD base

### Currency Selector

- Options: SGD, USD, HKD, Original
- Preference stored in `db.settings` with key `portfolio:preferredCurrency` (default: SGD)
- All monetary values across tabs convert when a non-Original currency is selected
- Original amount shown as secondary text when converted
- Missing FX rates gracefully fallback to original currency with warning

## Tabs

### Overview

- **KPI Cards**: Total Portfolio Value, Day Change (unrealized P&L proxy), Dividends YTD
- **AllocationChart**: Donut chart (Recharts PieChart) grouping positions by `secType`
- **CurrencyBreakdown**: Mini progress bars per currency
- **PerformanceSparkline**: Area chart placeholder with time-range toggle (1M/3M/6M/1Y/YTD/All); shows "Not enough data" until historical snapshots are implemented
- **Empty state**: "No portfolio data yet. Sync your brokerage account."

### Holdings

- **Grouped table**: Positions grouped by currency with collapsible headers
- **Columns**: Symbol, Qty, Avg Cost, Mkt Price, Mkt Value, P&L
- **Expandable rows**: Full name, raw cost basis, day/52W ranges from extensions, action buttons
- **Search**: Filters by symbol or name
- **Empty state**: "No holdings yet. Sync your account."

### Transactions (Portfolio Context)

- Enhanced unified transaction view with additional columns: Type, Symbol, Quantity, Price
- Type badges: BUY (green), SELL (red), DIVIDEND (amber), FEE (gray)
- Dividend-to-bank linking: detects matching bank deposits by amount + date proximity

### Dividends

- **Summary cards**: YTD Total, Monthly Average, Yield on Cost
- **DividendBarChart**: Monthly stacked bar chart by currency
- **Year selector**: Current year + previous 4 years
- **DividendTable**: Symbol, Ex-Date, Pay Date, Amount, Currency, Type
- **Filter**: All | Paid | Estimated

## Responsive Design

- Tab bar horizontally scrollable on narrow screens
- KPI cards stack vertically on mobile
- Holdings table horizontally scrollable with sticky Symbol column
- Donut chart legend wraps gracefully
- Dark mode compatible throughout

## Data Model

Uses existing Phase 1 brokerage tables:
- `brokeragePositions` — holdings with avgCost, marketValue, unrealizedPnl
- `brokerageAccounts` — cash balances per currency
- `brokerageTransactions` — order fills
- `brokerageCorpActions` — dividends, splits, etc.
- `brokerageSyncLog` — last sync timestamps

Plus new table:
- `fxRates` — `{ date, base, rates }` cached daily

## Testing

- Unit tests for FX conversion and caching
- Full test suite passes without regression
- Linter passes

## Future Work (Phase 3+)

- Historical portfolio snapshots for performance sparkline
- Adjusted cost basis including option premium tracking
- Dividend-to-bank transaction auto-linking
- Multiple brokerage account support
- Real-time price feed integration
