## Why

Phase 1 introduced a unified transaction view that mixes bank and brokerage rows on `/transactions`. Users can now see trades and dividends alongside spending, but there is no dedicated place to understand their portfolio as a whole — total value, allocation, holdings, or dividend income. A portfolio hub is essential for Lokfi's core value proposition of providing a complete financial picture. Phase 2 delivers a tabbed `/portfolio` page that surfaces this data in an actionable, visually rich layout.

## What Changes

- Add **Portfolio** navigation item to the sidebar between Dashboard and Import
- Create **`/portfolio` route** with a tabbed single-page layout: Overview | Holdings | Transactions | Dividends
- Build **Overview tab** with KPI cards (total value, day change, dividends YTD), asset allocation donut chart, currency breakdown cards, and a performance sparkline with time-range toggle
- Build **Holdings tab** with a grouped table showing positions by currency, including adjusted cost basis, market value, unrealized P&L, and expandable row detail
- Enhance **Transactions tab** with dedicated portfolio context, Type/Symbol/Qty/Price columns, and dividend-to-bank linking
- Build **Dividends tab** with YTD summary, monthly bar chart, yield-on-cost metric, and a focused dividend history table
- Add **FX rate integration** using the Frankfurter API (with fallback), cached in a new `fxRates` Dexie table, powering currency conversion across the portfolio
- Add a **currency selector** in the portfolio header that affects all monetary values on the page
- Ensure full **mobile responsiveness** and **dark mode compatibility**
- **No breaking changes** to existing transaction, rule, or category systems

## Capabilities

### New Capabilities
- `portfolio-overview`: KPI dashboard, asset allocation, currency breakdown, performance sparkline
- `portfolio-holdings`: Position table with adjusted cost basis, grouped by currency, expandable detail
- `portfolio-dividends`: Dividend tracking view with YTD metrics, monthly bar chart, yield-on-cost
- `fx-rate-integration`: Frankfurter API client, Dexie caching, currency conversion utilities
- `portfolio-navigation`: Sidebar nav entry and `/portfolio` routing

### Modified Capabilities
- `unified-transaction-view`: Add Type/Symbol/Qty/Price columns in portfolio context; add dividend-to-bank linking indicator

## Impact

- `apps/web/src/layouts/AppShell.tsx` — add Portfolio to `NAV_ITEMS`
- `apps/web/src/router.tsx` — add `/portfolio` route
- `apps/web/src/pages/portfolio/` — new directory with PortfolioPage and tab components
- `apps/web/src/lib/fx/` — new directory with FX rate client and cache
- `apps/web/src/lib/db/db.ts` — add `fxRates` table to Dexie schema (v6 migration)
- `apps/web/src/pages/transactions/` — minor enhancements for portfolio context (Type/Symbol/Qty/Price display)
