## Context

Lokfi is a personal finance app with a warm minimal aesthetic (amber accents, card-based UI, Tailwind CSS, Recharts). Phase 1 completed the unified transaction view on `/transactions`, allowing users to see bank transactions alongside brokerage data (BUY, SELL, DIVIDEND, FEE, CORP ACTION) with source-type tabs and disabled interactions for brokerage rows. Brokerage data is stored in separate Dexie tables (`brokerageTransactions`, `brokerageCorpActions`, `brokeragePositions`, `brokerageAccounts`) synced from Tiger Brokers via `SyncOrchestrator`.

The existing `/dashboard` page uses Recharts for spending charts and has a card-based layout. The app uses Dexie React Hooks (`useLiveQuery`) for reactive queries, `next-themes` for dark mode, and TanStack Router for routing.

## Goals / Non-Goals

**Goals:**
- Users can see their total portfolio value, day change, and dividends YTD in a dedicated Overview tab
- Users can browse all holdings grouped by currency with adjusted cost basis and unrealized P&L
- Users can view dividend income history with monthly trends and yield-on-cost metrics
- Users can switch their preferred display currency (SGD, USD, HKD) and see all values converted
- FX rates are fetched once per day and cached in Dexie for offline use
- The Portfolio page is accessible via sidebar navigation between Dashboard and Import

**Non-Goals:**
- No real-time market data streaming (uses last-synced prices from `brokeragePositions`)
- No options-specific cost basis adjustment in Phase 2 (raw cost basis only; option premium tracking is Phase 3+)
- No dividend-to-bank-transaction auto-linking in Phase 2 (manual linking or Phase 3+)
- No portfolio rebalancing suggestions or tax-loss harvesting
- No support for multiple brokerage accounts in Phase 2 (Tiger only)
- No auto-sync scheduling (remains manual via `/settings/brokerage`)

## Decisions

### 1. Recharts for All Charts
**Decision**: Use Recharts (already a dependency) for the donut chart, bar chart, and area sparkline.

**Rationale**:
- Recharts is already used in DashboardPage for spending/category charts
- No new dependency needed
- PieChart with inner radius creates the donut effect; AreaChart for sparkline; BarChart for monthly dividends

**Alternative considered**: Chart.js or D3. Rejected because Recharts is already integrated and the team knows it.

### 2. FX Rate Cache in Dexie (`fxRates` table)
**Decision**: Add an `fxRates` table to the Dexie schema (v6 migration) that stores `{ base, rates, date }`.

**Rationale**:
- Portfolio calculations need FX rates for every currency conversion; fetching on every render is wasteful
- Cached rates enable offline viewing of portfolio values
- Frankfurter API is free, rate-limited, and has no API key — caching respects the implicit rate limit

**Storage format**:
- Table: `fxRates` with composite key `[date+base]` (or just `date` if we always fetch USD base)
- Record: `{ date: '2024-05-04', base: 'USD', rates: { SGD: 1.35, HKD: 7.82, ... } }`
- Conversion: `amount * (rates[to] / rates[from])`

### 3. Adjusted Cost Basis — Raw Only in Phase 2
**Decision**: Show raw cost basis in Holdings tab. Note in UI that "adjusted cost basis (including options) is coming in a future update."

**Rationale**:
- True adjusted cost basis requires linking option transactions to assigned stock positions, which needs a new data model for option legs
- Raw cost basis from `BrokeragePosition.avgCost` is sufficient for 80% of users
- Avoids scope creep; option premium tracking is a well-defined Phase 3 feature

### 4. Currency Selector as Global Preference
**Decision**: Store preferred currency in `db.settings` with key `portfolio:preferredCurrency` (default: SGD). The selector in the Portfolio header reads/writes this setting.

**Rationale**:
- Users want a consistent currency view across all portfolio tabs
- Storing in settings means the preference persists across sessions
- Other pages (e.g., future Dashboard v2) can read the same key

### 5. Tab State in URL Query Param
**Decision**: Use a URL query parameter `?tab=overview` (defaulting to `overview`) to track the active tab, enabling deep-linking and back-button behavior.

**Rationale**:
- Users may want to share a link to their Holdings tab
- Back button should return to the previous tab, not exit the page
- TanStack Router supports query params natively

### 6. Holdings Data Computed from `brokeragePositions` + `brokerageAccounts`
**Decision**: Holdings tab queries `db.brokeragePositions` and `db.brokerageAccounts` directly. Market value is `quantity × avgCost` (since real-time prices are out of scope); P&L uses last-synced data.

**Rationale**:
- `BrokeragePosition` already has `avgCost`, `quantity`, and `marketValue` (if available from sync)
- If `marketValue` is null, fall back to `quantity × avgCost` as a conservative estimate
- This avoids needing a real-time price feed integration

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| **FX rate staleness**: If rates are >24h old, converted values may be misleading | Show "Last updated" micro-text with the rate date; refresh button to manually fetch |
| **Performance**: Large portfolios (100+ positions) may cause Recharts to lag | Memoize chart data with `useMemo`; use `ResponsiveContainer` with debounced resize |
| **Data freshness**: Portfolio value uses last-synced prices, not real-time | Display "Last sync: {timestamp}" prominently; encourage users to sync regularly |
| **Mobile chart readability**: Donut chart legend may overflow on narrow screens | Use horizontal scrollable legend or switch to list view below chart on mobile |
| **Schema migration**: Adding `fxRates` table requires Dexie v6 | Add standard Dexie version upgrade with `.stores()` — no data migration needed since it's a new table |

## Open Questions

1. Should the currency selector affect the `/transactions` page too, or only `/portfolio`? 
  - only affect portfolio page
2. Should we show cash balances from `brokerageAccounts` in the Overview total, or only holdings? 
  - show only holdings for now
3. What happens if `brokeragePositions` is empty (sync hasn't run)? Empty state design needed.
  - yes design empty state
