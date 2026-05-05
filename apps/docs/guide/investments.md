# Investments

Lokfi can track your brokerage portfolios alongside your finances, giving you a unified view of your net worth.

## Portfolio Tracking

The Investments page provides tabs for:

### Overview
A summary of your portfolio's total value, cost basis, and unrealized gain/loss across all connected brokerages.

### Holdings
A detailed view of each position — ticker, quantity, current price, market value, and performance. Prices are fetched via broker API where available.

### Transactions
Individual trade history — buys, sells, dividends, and corporate actions — synced from your brokerages and normalized into Lokfi's unified transaction format.

### Dividends
A dedicated view of dividend income across your portfolio. See payouts by period, by stock, or in aggregate.

### Currency

Toggle between SGD and USD (or your portfolio's native currency) using the currency selector. All values are converted using current exchange rates.

> **Note:** Currency conversion uses live rates from the Frankfurter API. If you're offline, the last cached rates are used.

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
