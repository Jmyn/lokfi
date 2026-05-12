# Investments

Lokfi can track your brokerage portfolios alongside your finances, giving you a unified view of your net worth.

## Portfolio Tracking

The Investments page provides tabs for:

### Overview
A summary of your portfolio's total value, dividend income, and performance across all connected brokerages. The Overview features a **Portfolio by bucket** chart and a **Performance** chart.

**KPIs:**
- **Total Portfolio Value** — Sum of all positions (market value or cost basis) plus cash balances across all accounts
- **Dividends (TTM)** — Total dividend income over the trailing 12 months, converted to your preferred currency

**Performance card:**

The Performance card plots your portfolio value over time as an area chart. Use the time-range pills to switch between **1M, 3M, 6M, 1Y, YTD**, and **All**. Above the chart, the card shows:
- **Return %** — Percentage change from the first to the last snapshot in the selected range, colored green (gain) or red (loss)
- **Absolute gain/loss** — The same change expressed in your preferred currency

> **Note:** Performance history is built from daily snapshots captured automatically each time you sync. The card shows "Sync again to start building history" until at least two snapshots exist for the selected range. Changing your preferred currency restates historical snapshots using current FX rates.

### Holdings
A detailed view of each position — ticker, quantity, current price, market value, and bucket assignment. The holdings view supports filtering by portfolio bucket, searching by ticker or name, and expanding positions to see lot-level detail.

### Transactions
Individual trade history — buys, sells, dividends, and corporate actions — synced from your brokerages and normalized into Lokfi's unified transaction format.

### Dividends
A dedicated view of dividend income across your portfolio. See payouts by period, by stock, or in aggregate.

### Currency

Toggle between your preferred currency (SGD, USD, etc.) or view values in their original currency using the currency selector. All values are converted using current exchange rates.

> **Note:** Currency conversion uses live rates from the Frankfurter API. If you're offline, the last cached rates are used.

---

## Portfolio Buckets

Portfolio buckets let you organize your holdings into custom groups (e.g., Growth, Income, Cash) and track how your portfolio allocation aligns with your targets.

### Default Buckets

Lokfi creates three default buckets on first use:
- **Growth** — For equity and growth-oriented positions
- **Income** — For dividend and income-generating holdings
- **Cash** — For money market, cash equivalents, and fixed income

Positions that aren't assigned to any bucket appear under **Unassigned**.

### Managing Buckets

Open **Settings → Portfolio buckets** to manage your buckets:

- **Rename** — Click the bucket name to edit it
- **Reorder** — Use the arrow buttons to change bucket display order
- **Recolor** — Pick from a palette of swatches to color-code each bucket
- **Add / Delete** — Create new buckets or delete existing ones (deleting a bucket unassigns its holdings)

#### Target Allocation

Each bucket can have a **target percentage** of your total portfolio:

1. Enter a percentage (0–100) in the **% target** field next to each bucket
2. A **Target total** summary bar shows your combined allocation
   - **Under 100%** — Shows remaining unallocated percentage
   - **Over 100%** — Highlighted red with the overage amount

Targets are optional — buckets without a target simply track actual allocation without comparison.

### Bucket Overview Chart

On the Overview tab, the **Portfolio by bucket** widget shows:

- **Pie chart** — Each holding appears as an individual slice, colored by its assigned bucket. Hover to see the holding name and value.
- **Legend** — Buckets are listed by total value (descending), each with its color indicator.
- **Bucket rows** — Each row shows:
  - Bucket name and total value
  - Actual allocation percentage
  - Target percentage (if set), shown as `actual% / target%`
  - **Delta indicator** — The difference between actual and target, color-coded:
    - ≤2% deviation — Green (on track)
    - ≤8% deviation — Amber (needs attention)
    - >8% deviation — Red (significantly off-target)
- **Expandable holdings** — Click a bucket row to expand it and see each holding's name, value, and proportional bar within that bucket

### Assigning Holdings to Buckets

From the **Holdings** tab, click the bucket icon on any position row to assign or reassign it to a bucket. Assignments are saved immediately to your local database.

### Empty States

The holdings view shows contextual messages depending on the situation:
- **No search results** — "No results for &lt;query&gt;"
- **Bucket filter with no holdings** — "No holdings in this bucket yet" with a button to show all holdings
- **No recognizable holdings** — Fallback message when security types are unknown

---

## Supported Brokerages

### Tiger Brokers (via OpenAPI)

Lokfi integrates with Tiger Brokers' OpenAPI for automated portfolio sync. To set it up:

1. Go to **Settings → Brokerage** in the app
2. Enter your Tiger Brokers API credentials (app ID, private key, etc.)
3. Click **Connect** — Lokfi will securely store your credentials in IndexedDB

Once connected, Lokfi syncs:
- Current holdings and positions
- Transaction history (trades, dividends, corporate actions)
- Real-time quotes (where the API supports it)

> Credentials are stored in IndexedDB and never leave your device. The sync runs entirely in your browser — Lokfi talks directly to the Tiger API.

### Security

- API credentials are stored in your browser's IndexedDB (encrypted at rest)
- No credential data is sent to any server — Lokfi connects directly to the broker API
- You can revoke API access at any time from your Tiger Brokers account

## Syncing

Sync happens on-demand. Click the **Sync** button to pull the latest data from your connected brokerages. Sync progress is shown in a progress bar.

### Sync Status

- **Idle** — Waiting for you to trigger a sync
- **Syncing** — Fetching data from the brokerage API
- **Complete** — Latest data is stored locally
- **Error** — Something went wrong (check your credentials or network)

## Coming Soon

Additional brokerage support is planned for future releases. If you have a specific broker you'd like supported, open a feature request on [GitHub](https://github.com/jmyn/lokfi).
