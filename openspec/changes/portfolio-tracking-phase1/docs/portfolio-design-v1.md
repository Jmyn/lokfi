# Portfolio Tracking — Design Mockup: Variation A
## "Integrated Portfolio Hub" (Tabbed Single-Page)

A single `/portfolio` route that feels like a unified command center. The user lands on **Overview** and tabs navigate between contexts without page loads.

---

## 1. Navigation Change

Add to `AppShell.tsx` `NAV_ITEMS`:

```ts
{ label: 'Portfolio', path: '/portfolio', icon: TrendingUp }
```

Place it between **Dashboard** and **Import** to signal its importance.

---

## 2. Page Layout: `/portfolio`

```
+----------------------------------------------------------+
|  Portfolio                                    [SGD ▼]    |  ← Header + Currency Selector
+----------------------------------------------------------+
|  [ Overview ] [ Holdings ] [ Transactions ] [ Dividends ]|  ← Tab bar (sticky below header)
+----------------------------------------------------------+
|                                                          |
|  [ TAB CONTENT ]                                         |
|                                                          |
+----------------------------------------------------------+
```

**Currency Selector** (top-right of header):
- Dropdown: `SGD | USD | HKD | Preferred`
- Affects ALL monetary values on the page
- Uses cached FX rates with a small "Last updated: today 09:00" micro-text
- Rates fetched from Frankfurter API (primary) or exchangerate-api (fallback)

---

## 3. Tab: Overview

The main dashboard. A grid of cards similar to existing DashboardPage widgets.

### KPI Row (3 cards)

```
+----------------------------------------------------------+
|  Total Portfolio Value      Day Change        Div YTD     |
|  S$ 147,230.50             +S$ 1,240 (+0.85%)  S$ 2,100  |
|  ≈ US$ 109,800             +US$ 920            ≈ US$1,570 |
+----------------------------------------------------------+
```

- **Total Portfolio Value**: Sum of all holdings market value + cash balances, converted to preferred currency
- **Day Change**: Unrealized P&L since last close (green/red)
- **Dividends YTD**: Sum of all dividend corp actions this calendar year
- Secondary line shows raw currency amount for the dominant underlying currency

### Allocation Section

```
+----------------------------------------------------------+
|  Asset Allocation                            [Donut Chart] |
|  ┌─────────┐                                             |
|  │  USD 65%│  US Equities    45%   S$ 66,254            |
|  │  SGD 30%│  SG Equities    15%   S$ 22,085            |
|  │  Cash 5%│  Cash           5%    S$  7,362            |
|  └─────────┘  Options        10%   S$ 14,723            |
|               Intl Equities  25%   S$ 36,806            |
+----------------------------------------------------------+
```

- Donut chart (Recharts PieChart with inner radius)
- Legend lists asset classes with color swatch, %, and converted value
- Hover on donut segment highlights the legend row

### Currency Breakdown

```
+----------------------------------------------------------+
|  By Currency                                             |
|  ┌─────────────────┐  ┌─────────────────┐                |
|  │  USD  $109,800  │  │  SGD  S$ 37,430 │                |
|  │  74.5% of total │  │  25.5% of total │                |
|  │  [ mini bar ]   │  │  [ mini bar ]   │                |
|  └─────────────────┘  └─────────────────┘                |
+----------------------------------------------------------+
```

- Two-column card layout for each currency bucket
- Mini horizontal progress bar showing % of total portfolio
- Expandable: click to see holdings within that currency

### Performance Sparkline

```
+----------------------------------------------------------+
|  Portfolio Value (6M)                                    |
|                              /\                          |
|                         /\  /  \    /\                   |
|                        /  \/    \  /  \                  |
|                       /            \/   \____             |
|  S$120k ─────────────────────────────────────────        |
|  S$150k ─────────────────────────────────────────        |
+----------------------------------------------------------+
```

- Simple area chart showing portfolio value over last 6 months
- Uses stored historical sync snapshots (from `BrokerageAccount` or computed from holdings + transactions)
- Time range toggle: 1M | 3M | 6M | 1Y | YTD | All

---

## 4. Tab: Holdings

A table showing every position with per-position detail. Grouped by currency.

```
+----------------------------------------------------------+
|  Holdings                                     [🔍 Search] |
+----------------------------------------------------------+
|  ▼ USD Holdings                                          |
|  Symbol   Qty    Avg Cost   Mkt Price   Mkt Value   P&L   |
|  ─────────────────────────────────────────────────────── |
|  AAPL     50     US$185.00  US$195.00   US$9,750   +$500 │
|  TSLA     20     US$210.50  US$205.00   US$4,100   -$110 │
|  NVDA     10     US$120.00* US$125.00   US$1,250   +$50  │
|  ─────────────────────────────────────────────────────── |
|  ▼ SGD Holdings                                          |
|  D05.SI   1000   S$32.50   S$33.20     S$33,200   +$700 │
|  ─────────────────────────────────────────────────────── |
|  ▼ Options (USD)                                         |
|  AAPL     -1     US$5.00   US$2.50      US$250    +$250 │  ← short call
+----------------------------------------------------------+
```

### Columns

| Column | Description |
|--------|-------------|
| Symbol | Ticker with country/exchange badge (e.g., `.SI` for Singapore) |
| Qty | Current quantity. Negative for short options |
| Avg Cost | **Adjusted cost basis** (see Cost Basis Logic below). Asterisk `*` if adjusted by options |
| Mkt Price | Last known price (from sync or manual update) |
| Mkt Value | `Qty × Mkt Price` |
| P&L | Unrealized: `(Mkt Price - Avg Cost) × Qty`. Color-coded green/red |
| Day Δ% | Optional: percentage change since previous close |

### Cost Basis Logic (Critical)

**Adjusted Cost Basis** is computed as:

```
adjCostBasis = rawCostBasis - optionPremiumReceived + optionPremiumPaid
```

Example:
- Buy 100 AAPL at $185 = $18,500 raw cost
- Sell 1 AAPL put @ $5.00 premium, assigned → receive $500 premium
- Adjusted cost basis = $18,500 - $500 = $180.00/share

**UI treatment**:
- Show `Adj: $180.00` as primary value
- Tooltip on hover (or small `*` footnote) reveals: `Raw: $185.00 — Adjusted by $5.00 put premium`
- If no option adjustment, show raw cost basis plainly without asterisk

### Expandable Row Detail

Clicking a row expands to show:

```
  ┌──────────────────────────────────────────────────────┐
  │  AAPL — Apple Inc. (NASDAQ)                          │
  │  ─────────────────────────────────────────────────── │
  │  Raw Cost Basis:   US$185.00/share  (US$9,250 total) │
  │  Adj. Cost Basis:  US$180.00/share  (US$9,000 total) │
  │  Adjusted by:      −US$500 (AAPL PUT $180 assigned)  │
  │  ─────────────────────────────────────────────────── │
  │  Day Range:  US$192.00 — US$196.50                   │
  │  52W Range:  US$164.08 — US$237.49                   │
  │  ─────────────────────────────────────────────────── │
  │  [View Transactions] [View Corp Actions]             │
  └──────────────────────────────────────────────────────┘
```

---

## 5. Tab: Transactions

**Unified with bank transactions**, but visually distinguished.

### Filter Bar (enhanced from existing)

```
+----------------------------------------------------------+
|  [All] [Bank] [Brokerage]  [Source: ▼] [Date: ▼] [Type▼]|
+----------------------------------------------------------+
```

- **Source Type tabs**: All | Bank | Brokerage — quick filter without losing the table
- **Source dropdown**: Now includes both banks ("DBS", "OCBC") and brokerages ("Tiger Brokers")
- **Type dropdown**: BUY | SELL | DIVIDEND | DEPOSIT | WITHDRAWAL | FEE | TRANSFER | INTEREST

### Transaction Table (enhanced)

Same structure as existing `TransactionTable`, with these additions:

| Column | Notes |
|--------|-------|
| Date | As existing |
| Description | As existing |
| Type | **New** — badge: `BUY` (green), `SELL` (red), `DIVIDEND` (amber), `FEE` (gray), etc. |
| Symbol | **New** — for brokerage transactions only (blank for bank) |
| Quantity | **New** — for BUY/SELL |
| Price | **New** — per-share price for BUY/SELL |
| Amount | Total value. Same red/green as existing |
| Source | Enhanced: `🏦 DBS` or `📈 Tiger Brokers` — small icon prefix |
| Category | For bank txns only. Brokerage txns show `—` or auto-tag `Investment` |

**Dividend row example**:
```
| 2024-03-15 | AAPL Dividend       | DIVIDEND | AAPL | — | — | +US$12.50 | Tiger | —      |
```

**BUY row example**:
```
| 2024-02-01 | Buy AAPL           | BUY      | AAPL | 10 | $185.00 | −US$1,850 | Tiger | —      |
```

### Dividend Income Integration

Dividends are tagged as `DIVIDEND` type. In the bank transaction world, they map to the **Income** category. To integrate:

1. **Auto-categorize**: When a `DIVIDEND` corp action is synced, also create a linked bank-style transaction with `category = 'income'` (or a new `Dividend Income` subcategory)
2. **On Portfolio > Dividends tab**: Show them in portfolio context
3. **On Transactions page**: They appear with `Type: DIVIDEND`, `Source: Tiger Brokers`, and if linked to a bank deposit, show a chain icon linking to the bank txn

---

## 6. Tab: Dividends

A dedicated view for dividend tracking, integrated with the transactions table but focused.

```
+----------------------------------------------------------+
|  Dividends                      [2024 ▼] [All | Paid | Est]|
+----------------------------------------------------------+
|  YTD Total: S$ 2,100                                     |
|  Monthly Average: S$ 350                                 |
|  Yield on Cost: 1.42%                                    |
+----------------------------------------------------------+
|  [Bar Chart: Monthly Dividend Income]                    |
|  Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct...    |
|  ▓▓   ▓    ▓▓▓  ▓    ▓    ▓▓   ▓    ▓▓▓  ▓    ▓       |
+----------------------------------------------------------+
|  Symbol    Ex-Date   Pay Date   Amount    Currency  Type  |
|  ─────────────────────────────────────────────────────── |
|  AAPL      02-09     02-15     US$12.50   USD      Cash  |
|  D05.SI    04-22     05-08     S$85.00    SGD      Cash  |
|  ─────────────────────────────────────────────────────── |
+----------------------------------------------------------+
```

- **Yield on Cost**: Annual dividends / total adjusted cost basis
- **Monthly bar chart**: Recharts BarChart, one bar per month
- **Type**: Cash | DRIP | Stock (future-proofing)

---

## 7. FX Rate Integration

**Recommended API: Frankfurter** (`https://api.frankfurter.dev/v2/latest?from=USD&to=SGD`)
- No API key required
- Open source, can self-host
- ECB reference rates (updated daily ~16:00 CET)
- Free for commercial use

**Fallback: exchangerate-api open endpoint** (`https://open.er-api.com/v6/latest/USD`)
- No API key
- Daily updates
- Requires attribution

**Implementation**:
- Cache rates in Dexie (`fxRates` table) with `date` key
- Fetch once per day on app load
- Store as: `{ base: 'USD', rates: { SGD: 1.35, HKD: 7.82, ... }, date: '2024-05-04' }`
- Conversion: `amount * (rates[to] / rates[from])`

---

## 8. Mobile Responsiveness

- Tabs become horizontal scrollable on narrow screens
- Holdings table: horizontal scroll with sticky Symbol column
- KPI cards stack vertically
- Currency selector moves below page title

---

## Summary of Files to Touch

| File | Change |
|------|--------|
| `src/layouts/AppShell.tsx` | Add Portfolio to NAV_ITEMS |
| `src/router.tsx` | Add `/portfolio` route |
| `src/pages/portfolio/PortfolioPage.tsx` | Main tabbed shell |
| `src/pages/portfolio/OverviewTab.tsx` | KPI + allocation + performance |
| `src/pages/portfolio/HoldingsTab.tsx` | Holdings table with detail |
| `src/pages/portfolio/TransactionsTab.tsx` | Filtered brokerage transactions |
| `src/pages/portfolio/DividendsTab.tsx` | Dividend tracking view |
| `src/pages/portfolio/CurrencySelector.tsx` | Shared dropdown component |
| `src/lib/fx/rates.ts` | Frankfurter API client + cache |
| `src/lib/db/db.ts` | Add `fxRates` table to schema |
| `src/pages/transactions/TransactionTable.tsx` | Add Type, Symbol, Qty, Price columns; source icons |
| `src/pages/transactions/TransactionFilters.tsx` | Add Source Type filter, Type filter |
