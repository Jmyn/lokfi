# Privacy & Security

Privacy is Lokfi's founding principle. The entire application is built around the idea that your financial data belongs to you and **no one else**.

## Zero Telemetry

Lokfi has a strict **Zero Telemetry** policy:

- ❌ No analytics scripts
- ❌ No tracking cookies
- ❌ No error reporting to third parties
- ❌ No usage statistics
- ❌ No data collection of any kind

The code is open-source specifically so you can verify this yourself.

## Local-First Architecture

All processing happens on your device:

| Operation | Where it runs |
|-----------|--------------|
| PDF parsing | Web Worker in your browser (`pdfjs-dist`) |
| CSV parsing | Your browser (no upload) |
| Rule evaluation | Your browser |
| Chart rendering | Your browser (Recharts) |
| FX conversion | Your browser |
| Data storage | IndexedDB in your browser |

**No financial data is ever transmitted to a server.** The application has no backend.

## Data Storage

Lokfi uses **IndexedDB** (via Dexie.js) for all data storage:

- Transactions, categories, rules, and settings all live in IndexedDB
- Data persists across browser sessions
- Clearing your browser data will remove all Lokfi data
- Export/import functionality is available for backup

### Backup

To back up your data:

1. Go to **Profile → Settings**
2. Use the **Export** option to download your data as JSON
3. Store the file somewhere safe

To restore, use the **Import** option on the same page.

## Brokerage API Security

When connecting to Tiger Brokers via OpenAPI:

- Credentials are stored in IndexedDB — **never sent to any server**
- Lokfi connects directly to the Tiger API from your browser
- No intermediary or proxy is involved
- You can revoke API access at any time from your Tiger Brokers account

## Open Source

The entire codebase is [MIT licensed](https://github.com/jmyn/lokfi/blob/main/LICENSE) and available on [GitHub](https://github.com/jmyn/lokfi). Anyone can audit the code to verify the privacy claims. Contributions are welcome.

## Frequently Asked Privacy Questions

**Does Lokfi have a server?**
No. The web app is a static site hosted on a CDN. There is no backend, no database, no API server.

**What about the exchange rate API?**
Lokfi fetches exchange rates from the Frankfurter API (a free, public service). No financial data is sent in the request — only the currency pair and date. Rates are cached locally.

**Can I use Lokfi offline?**
Once the app is loaded, yes. All data and processing are local. Exchange rates will use cached data when offline.

**What happens if I clear my browser data?**
All Lokfi data will be removed. Make sure to export a backup first.
