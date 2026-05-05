# Tiger Brokers OpenAPI — Setup for Lokfi

This document covers how to configure Tiger Brokers market data access for the Lokfi portfolio sync pipeline.

## Prerequisites

1. **Tiger Brokers account** — a funded trading account with Tiger Brokers (SG, HK, US, NZ, or AU license).
2. **OpenAPI access activated** — visit [developer.tigerbrokers.com.sg](https://developer.tigerbrokers.com.sg) (or the equivalent for your region: `developer.tigerbrokers.com`, `developer.itigerup.com`). Go to **Developer Center → My Apps** and create an application to receive your `tiger_id`.

## Step 1 — Generate an RSA Key Pair

The Tiger OpenAPI uses RSA signature authentication. You need a 2048-bit RSA key pair.

```bash
# Generate a 2048-bit RSA private key
openssl genrsa -out tiger_private.pem 2048

# Extract the public key
openssl rsa -in tiger_private.pem -pubout -out tiger_public.pem
```

**Important:** Lokfi requires the private key in **PKCS8** format. If you generated a PKCS1 key (header says `BEGIN RSA PRIVATE KEY`), convert it:

```bash
openssl pkcs8 -topk8 -inform PEM -outform PEM -in tiger_private.pem -out tiger_private_pkcs8.pem -nocrypt
```

## Step 2 — Upload Public Key

In the Tiger Developer Center, go to your app and upload the **public key** (`tiger_public.pem`). Tiger will use this to verify your API request signatures.

## Step 3 — Configure Lokfi

The Tiger provider expects three pieces of configuration:

| Field | Description | Example |
|---|---|---|
| `tigerId` | Your developer ID from the Tiger Developer Center | `12345` |
| `privateKey` | RSA private key in PKCS8 PEM format | `-----BEGIN PRIVATE KEY-----\n...` |
| `account` | Your Tiger trading account number | `U1234567` |
| `serverUrl` | (Optional) API base URL | `https://openapi.tigerfintech.com` (default) |

These credentials are encrypted with a user-supplied passphrase using Web Crypto (AES-256-GCM + PBKDF2) and stored in IndexedDB. They **never** appear in plaintext in any persistent store.

## API Activation

**OpenAPI access is free** — no additional subscription needed. After your Tiger account is opened and funded:

1. Visit [developer.tigerbrokers.com.sg](https://developer.tigerbrokers.com.sg)
2. Go to **Developer Center → My Apps** → create an application → upload your RSA public key
3. API access is activated immediately — no endpoint-specific permissions required

The `fund_details` (fund details / corporate actions) endpoint is included in standard OpenAPI access. No separate activation needed.

## API Endpoints Used (Read-Only)

All endpoints are accessed via `POST https://openapi.tigerfintech.com/gateway` with JSON body and RSA-signed authentication.

| Data | Tiger API Method | Key Parameters |
|---|---|---|
| Positions | `positions` | `account` (in bizContent) |
| Orders (filled) | `filled_orders` | `account`, `start_date`, `end_date` (yyyy-MM-dd) |
| Order transactions | `order_transactions` | `account`, `id` (orderId) |
| Account assets | `assets` | `account` |
| Prime assets | `prime_assets` | `account` |
| Fund details | `fund_details` | `account`, `fund_type: "ALL"`, `seg_types: ["SEC"]`, `start_date`, `end_date` |

## Rate Limits

Tiger enforces per-method tiered rate limits on a 60-second rolling window:

| Tier | Limit | Methods |
|---|---|---|
| High | 120 req/min | Order queries, trading |
| **Medium** | **60 req/min** | **Positions, assets** |
| **Low** | **10 req/min** | **Fund details**, market status, symbol info |

Lokfi's sync orchestrator implements tier-aware throttling:
- **Medium-tier** (positions, assets, account): 1100ms between requests
- **Low-tier** (fund details): 6100ms between requests
- **High-tier** (orders, transactions): 600ms between requests

Exceeding limits persistently may result in your `tiger_id` being blacklisted automatically. Contact Tiger support for higher limits.

## Fund Details

### What's Available

Tiger's standard OpenAPI provides account-level cash ledger history via the `fund_details` endpoint with `fund_type: 'ALL'`. This returns 13 distinct transaction types including trades, dividends, dividend tax, fees (Commission, Platform Fee, GST, SEC Fee, etc.), transfers, and rebates. Each record includes:

- `amount` — value of the fund change (positive = inflow, negative = outflow)
- `currency` — USD, SGD, HKD, etc.
- `desc` — description (e.g. "Buy-AVGO", "XDTE-DIVIDEND", "Funds Transfer In")
- `businessDate` — Tiger-defined business date when the action was applied
- `segType` — `SEC` (securities) or `FUT` (futures)
- `type` — fund type label (e.g. "Trade", "Dividend", "Dividend Tax", "Commission", "Platform Fee")

**Correct parameter format** (fund_type: 'ALL' for complete cash ledger):

```json
{
  "fund_type": "ALL",
  "seg_types": ["SEC"],
  "start_date": "2026-02-01",
  "end_date": "2026-05-01",
  "limit": 100
}
```

Key: `seg_types` is an **array of strings** using Tiger's enum values `SEC`/`FUT` (not `S`/`C`), and `fund_type` is the **string** `"ALL"` for the complete cash ledger. Pagination is driven by the `pageCount` field in Tiger's response metadata. The first request (page 1) reveals the total number of pages; subsequent requests fetch pages 2 through `pageCount`. A 6100ms delay is applied between pages to respect the Low-tier rate limit (10 req/min). Records are deduplicated by `id` as a safety net in case the API returns overlapping data across pages.

### Type Classification

The adapter maps Tiger `type` strings to normalized `FundDetailType` values:

| Tiger type | Classified As |
|---|---|
| Dividend | DIVIDEND |
| Dividend Tax | DIVIDEND_TAX |
| Trade | TRADE |
| Commission, Platform Fee, GST, SEC Fee, etc. | FEE |
| Funds Transfer In | TRANSFER_IN |
| Campaign Subsidy | REBATE |

Trade records are enriched with quantity/price data from `filled_orders` by matching symbol, date, and action. Unenriched trade records still appear in the unified view with the total amount only.

## Market/Account Segmentation

Tiger returns account data segmented by:

- **Currency** — USD, HKD, SGD, CNH (one record per currency)
- **Segment** — `S` (Securities/Stocks) and `C` (Commodities/Futures)

Lokfi stores these as separate `BrokerageAccount` records with `segType` field, enabling per-segment balance queries.

## Verification (Quick Test)

Run the verification script to confirm your credentials work and pull real data:

**PowerShell:**
```powershell
$env:TIGER_ID="your_developer_id"
$env:TIGER_PRIVATE_KEY="C:\Users\you\.ssh\tiger_private_pkcs8.pem"
$env:TIGER_ACCOUNT="U1234567"
pnpm --filter @lokfi/web test-tiger
```

**Bash/Linux:**
```bash
export TIGER_ID=your_developer_id
export TIGER_PRIVATE_KEY="$(cat ~/.ssh/tiger_private_pkcs8.pem)"
export TIGER_ACCOUNT=U1234567
pnpm --filter @lokfi/web test-tiger
```

The script will:
1. **Connection check** — authenticates with the API via the `assets` endpoint
2. **Positions** — displays all current holdings with P&L breakdown
3. **Account summary** — cash balance, net liquidation by currency segment
4. **Recent orders** — last 30 days of filled orders
5. **Fund details** — last 90 days of fund detail records (dividends, fees, trades, transfers, rebates)

### What success looks like

```
Tiger OpenAPI — Connection Verification

─── 1. Connection Check ──────────────────────────────────────
✓ Authenticated successfully — received 2 asset record(s)

─── 2. Positions ─────────────────────────────────────────────
✓ Fetched 5 position(s)

  Symbol           Qty     AvgCost        MktVal         P&L     P&L%  Currency
  ─────────────────────────────────────────────────────────────────
  AAPL              100     $150.00     $17,500.00   +$2,500.00  +16.67%  USD
  TSLA               50     $220.00     $10,000.00    -$1,000.00  -9.09%  USD
  ...

─── 3. Account Summary ───────────────────────────────────────
  Segment   Currency          Cash        NetLiq     BuyingPwr
  ──────────────────────────────────────────────
  Stocks        USD     $5,000.00    $45,000.00    $10,000.00
  Futures       USD       $500.00     $2,000.00          N/A

─── 4. Recent Filled Orders ──────────────────────────────────
✓ Fetched 3 filled order(s)
...

─── 5. Fund Details ─────────────────────────────────────────
✓ Fetched 12 fund detail record(s)
  2025-03-15  AAPL Dividend  $24.00

─── Result ───────────────────────────────────────────────────
✓ Connection working
```

### Troubleshooting

| Symptom | Likely fix |
|---|---|
| `Authentication failed` | Key is PKCS1 — convert to PKCS8: `openssl pkcs8 -topk8 -inform PEM -outform PEM -in key.pem -out key_pkcs8.pem -nocrypt` |
| `API error [-1]` | `tiger_id` or account number is wrong, or public key not uploaded in Developer Center |
| `HTTP 403` | OpenAPI access not activated — visit `developer.tigerbrokers.com.sg` |
| `Fund details unavailable` | `fund_details` endpoint requires specific account permissions |

## Validation (Programmatic)

Use the `validateConnection()` method to confirm credentials work without fetching full datasets:

```typescript
const provider = new TigerProvider({
  config: { tigerId, privateKey, account },
})
const ok = await provider.validateConnection()
// ok === true means auth + connectivity are working
```

## Environment Variables (Reference)

For development/tooling purposes (not for the browser app), you can export:

```bash
export TIGER_ID=your_developer_id
export TIGER_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
export TIGER_ACCOUNT=U1234567
```

These are **not** consumed by the browser app. The app uses the encrypted credential manager instead.

## SDK Note

The official `@tigeropenapi/tigeropen` npm package (v0.1.0) is Node.js-only — it uses `crypto.createSign` and `fs.readFile` which are not available in browsers. Lokfi implements a browser-compatible HTTP client that replicates the SDK's RSA signing flow using the Web Crypto API (`crypto.subtle`), keeping the same request structure and API method names. The type definitions in `tiger-types.ts` mirror the SDK's internal models.
