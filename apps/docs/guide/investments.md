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

#### Cost basis for crypto holdings

Stock brokers report each position's average cost directly. The Crypto.com Exchange API does not — it only reports current quantity and market value for spot holdings — and it serves at most ~6 months of trade history. So Lokfi reconstructs the average cost as a **weighted average** of:

- **Your synced trades** (real fill prices), which accumulate permanently as you sync — keep syncing and the record only grows.
- **An opening balance** — the quantity you held before your synced history begins. Lokfi prices it at the market price on your earliest known activity date (a fixed historical price, so your cost basis does **not** drift as the market moves) and shows an **Estimated** badge on the holding.

Expand a holding to see its cost basis. When a holding has an opening balance, an **Initial cost per unit** field lets you enter what you actually paid for that early portion; it blends with your real trades into the average, and the holding switches to a **Manual** badge. The number you type is the *opening* cost per unit, so the average shown will differ once your real trades mix in. Setting it is optional — the estimate is used until you do, and you only ever set one number per coin. Your overrides are saved locally and are included in backups.

> Lokfi computes a **weighted-average** cost basis, not specific-lot (FIFO/tax-lot) accounting. Treat the unrealized P&L on `Estimated` holdings as an approximation; set the initial cost to make it exact. Coins with no synced history and no initial cost set show as `incomplete` (zero cost) until you enter one.

### Transactions
Individual trade history — buys, sells, dividends, and corporate actions — synced from your brokerages and normalized into Lokfi's unified transaction format.

### Dividends
A dedicated view of dividend income across your portfolio. See payouts by period, by stock, or in aggregate.

> **Crypto.com Exchange staking rewards** are the crypto equivalent of dividends, but the exchange's staking endpoints are not reachable from a browser (no CORS support), so staking rewards are **not synced in the default browser-only build**. The capability is implemented and can be enabled behind a same-origin proxy — see the note under [Crypto.com Exchange](#crypto-com-exchange-via-exchange-v1-api).

### Signals (9 Sig Lite)

The Signals tab shows a **9 Sig Lite** indicator for TQQQ (3x leveraged Nasdaq) — a quick read on whether the market is keeping pace with Jason Kelly's 9% quarterly target.

**What it shows:**
- **91-Day Growth** — TQQQ's price change over the last 91 days (a rolling quarterly proxy)
- **9% Target** — The Kelly 9% quarterly benchmark, always displayed as a reference
- **Delta** — How far above or below the 9% pace the current growth sits
- **Days Analyzed** — How many days of price data were actually available (may be fewer than 91 for newly listed instruments)

**Signal badge:**
- **Above 9 Sig pace** (green) — Growth exceeds target by more than 0.5 percentage points
- **Below 9 Sig pace** (red) — Growth trails target by more than 0.5 percentage points
- **On 9 Sig pace** (neutral) — Growth is within 0.5 percentage points of the target

**Price chart:** A line chart of TQQQ's daily closing price with a horizontal reference line at the 9% target price.

**Data source:** The tab automatically picks the first configured brokerage that supports historical bar queries (Tiger first, then alphabetical — Crypto.com Exchange also qualifies, serving candlestick history for crypto instruments). Data is cached in-memory for 5 minutes. Use the **Refresh** button to bypass the cache.

> **Note:** This is the Lite variant — no plan setup, no calendar-quarter alignment, no rebalance triggers. It's a pure market-read indicator. The 91-day rolling window is a proxy for Kelly's exact quarterly cadence.

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

### Crypto.com Exchange (via Exchange v1 API)

Lokfi connects to the **Crypto.com Exchange** (the trading platform at crypto.com/exchange — not the Crypto.com App). To set it up:

1. On the exchange, open **User Center → Settings → API Keys** and create a new key
2. Leave it at the default **Can Read** permission — Lokfi is read-only and never needs trading or withdrawal access
3. (Optional) If you enable the key's IP whitelist, include the IP of the device running Lokfi
4. In the app, go to **Settings → Brokerage → Crypto.com Exchange**, paste the **API key** and **secret key**, then click **Test Connection** and **Full Sync**

Once connected, Lokfi syncs:
- Spot holdings and staked assets (balances and market value)
- Trade history (buys and sells, with fees)
- The account ledger — deposits, withdrawals, conversions, and fees
- Candlestick history for the Signals tab

**Things to know about the Exchange API:**
- **~6-month history.** The exchange only serves about six months of trade and ledger history. Your first sync covers the last 180 days; to build a longer record, keep syncing regularly (Lokfi accumulates history locally over time).
- **First sync can take a few minutes.** Trade history is rate-limited to roughly one request per second, so backfilling an active account is deliberately paced. The progress bar shows which window is being fetched.
- **Cost basis is computed, not reported** — see the note under [Holdings](#holdings).
- **Staking rewards and deposit/withdrawal enrichment require a proxy.** The exchange serves CORS headers for its trading, account, and ledger endpoints, but **not** for its Wallet API (deposit/withdrawal history) or Staking API (reward history). From a browser these are unreachable, so Lokfi skips them by default: staking rewards are not synced, and deposits/withdrawals come through the account ledger without their txid/fee details. The code supports enabling these endpoints when requests are routed through a same-origin proxy (`enableProxiedEndpoints`), which a self-hosted deployment can add.
- **Exchange only.** Holdings in the Crypto.com App (card, App Earn, App-side balances) are not visible to this API. Transfers between the App and the Exchange show up as deposits and withdrawals (via the ledger).

> Credentials are stored in IndexedDB and never leave your device. The sync runs entirely in your browser — Lokfi signs each request locally and talks directly to the Crypto.com Exchange API.

### Security

- API credentials are stored in your browser's IndexedDB (encrypted at rest)
- No credential data is sent to any server — Lokfi connects directly to the broker/exchange API
- Use **read-only** API keys wherever the provider supports them (the Crypto.com Exchange default)
- You can revoke API access at any time from your Tiger Brokers or Crypto.com Exchange account

## Syncing

Sync happens on-demand. Click the **Sync** button to pull the latest data from your connected brokerages. Sync progress is shown in a progress bar.

### Sync Status

- **Idle** — Waiting for you to trigger a sync
- **Syncing** — Fetching data from the brokerage API
- **Complete** — Latest data is stored locally
- **Error** — Something went wrong (check your credentials or network)

## Coming Soon

Additional brokerage support is planned for future releases. If you have a specific broker you'd like supported, open a feature request on [GitHub](https://github.com/jmyn/lokfi).
