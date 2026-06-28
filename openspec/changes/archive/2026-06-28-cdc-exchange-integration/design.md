# Design: Crypto.com Exchange Integration

## Context

The app syncs brokerage data through a normalized pipeline: a `BrokerageProvider` implementation fetches raw data, adapters map it to normalized types (`BrokeragePosition`, `BrokerageTransaction`, `BrokerageFundDetail`, `BrokerageAccount`, `BrokerageKlineBar`), and the `SyncOrchestrator` persists it to source-discriminated Dexie tables with incremental checkpoints (14-day overlap, periodic 180-day deep sync). Tiger Brokers is the only real provider; `CdcStubProvider` returns empty arrays.

The Crypto.com Exchange v1 API (REST, `https://api.crypto.com/exchange/v1/`) has been researched and covers every data category we need, with these constraints that shape the design:

- **No cost basis for spot holdings** — `private/user-balance.position_balances[]` returns only quantity + market value per token. Average entry price exists only for derivatives (out of scope).
- **6-month retention** on orders/trades/transactions history.
- **Tight throttles for history**: `private/get-trades` and `private/get-order-history` are 1 req/s; `get-trades` windows max 7 days; max 100 rows/request; cursor (timestamp) pagination only.
- **Staking history capped at 180 days** (`private/staking/get-reward-history`, `get-stake-history`).
- **Deposit/withdrawal history** is master-account-only and permission-gated; default 90-day window but older ranges queryable via explicit timestamps.
- Auth is HMAC-SHA256 over `method + id + api_key + paramsString + nonce`; all private calls are POSTs; decimals sent as strings; keys default to read-only.

## Goals / Non-Goals

**Goals:**

- Full `BrokerageProvider` implementation for Crypto.com Exchange (spot + staking) with feature parity in the Holdings, Overview, Dividends, Transactions, and Signals tabs.
- Client-side weighted-average cost basis for spot holdings, so Holdings shows avgCost / unrealized P&L / total return like Tiger positions.
- Continuous-sync posture that accumulates history beyond the API's 6-month retention in the local append-only tables.
- Reuse existing infrastructure unchanged where possible: credential encryption, sync orchestrator, Dexie schema, UI tabs.

**Non-Goals:**

- Derivatives positions, margin, funding-rate tracking (`private/get-positions` unused).
- Trading or withdrawal actions — strictly read-only; users should create read-only API keys.
- Crypto.com App data (card cashback, App Earn) — only the Exchange API. App↔Exchange transfers appear as deposits/withdrawals.
- Sub-account support (deposit/withdrawal history is master-only anyway).
- Tax-lot (FIFO) accounting — weighted average only, per scope decision.

## Decisions

### D1: Direct HTTP client, no SDK

Build `cdc-http-client.ts` mirroring the `tiger-http-client.ts` pattern (browser `fetch` + Web Crypto), rather than adding ccxt.

- *Why*: ccxt is a multi-megabyte dependency for ~10 endpoints; the existing Tiger client proves the direct pattern works in this codebase; HMAC-SHA256 via `crypto.subtle` is simpler than the RSA signing already implemented for Tiger.
- *Signing*: payload = `method + id + api_key + paramsString + nonce` where `paramsString` is params sorted by key ascending, concatenated as `key+value` recursively; `sig = hex(HMAC-SHA256(payload, secret))`. Nonce = `Date.now()`. All numeric params serialized as strings.
- *Alternative considered*: ccxt (`cryptocom` id) — rejected for bundle size and abstraction mismatch with our normalized types.

### D2: Positions from `user-balance.position_balances`, enriched by the cost-basis engine

`fetchPositions` calls `private/user-balance` and maps each `position_balances[]` entry (token quantity, market value) to a `BrokeragePosition`. Staked instruments (e.g. `SOL.staked`) become separate positions cross-checked against `private/staking/get-staking-position`. Because the API has no avgCost, the provider returns positions with basis fields unset, and the sync pipeline runs the cost-basis engine (D4) to fill `avgCost`, `unrealizedPnl`, `unrealizedPnlPercent` before upsert.

- *secType*: add `'CRYPTO'` to the `SecType` union in `packages/brokerage-core` (current values STK/OPT/FUT/FOP/CASH/FUND/WAR/MLEG don't fit). Holdings UI treats unknown secTypes generically, so impact is additive.
- *Symbol convention*: positions use the bare token (`BTC`, `SOL.staked` → `SOL` with a staked extension flag); position currency = `USD` (the exchange reports market values USD-denominated in its unified account).
- *Alternative considered*: deriving holdings by replaying the ledger — rejected; `user-balance` is authoritative for current quantity, ledger replay is only needed for basis.

### D3: Trades as transactions; pair→token mapping owned by the adapter

`fetchTransactions` syncs `private/get-trades` (fills, with fees and maker/taker side). `BrokerageTransaction.symbol` stores the instrument pair (`BTC_USD`) — consistent with "what was traded" — while the adapter exposes `baseToken`/`quoteCurrency` parsing used by the cost-basis engine and unified-transaction display. `orderId` = CDC `order_id`; natural key `cdc_<trade_id>` (trade-level, not order-level, since one order can fill many times — Tiger uses order-level ids, but trades are the atomic unit here and the table is append-only with content dedup).

### D4: Weighted-average cost-basis engine as a pure module

New `spot-cost-basis.ts` (pure functions + tests, like `nineSigLite.ts`):

- Input: chronologically ordered basis events for one token — BUY/SELL trades (from `brokerageTransactions`), deposits/withdrawals and conversions (from `brokerageFundDetails`).
- State per token: `quantity`, `totalCost`. BUY: add qty, add cost (price×qty + fee). SELL: reduce qty, reduce cost proportionally (`totalCost *= 1 - soldQty/qty`), realized P&L = proceeds − removed cost. DEPOSIT: add qty at market price on deposit date (fetched via `public/get-candlestick` 1D bar, cached); flag `basisQuality = 'estimated'`. WITHDRAWAL: reduce proportionally.
- If events are missing (history starts after the 6-month wall, or a deposit price lookup fails): flag `basisQuality = 'incomplete'`; if computed quantity diverges from the authoritative `user-balance` quantity beyond a tolerance, reconcile by inserting a synthetic deposit-like event at the divergence point and flag it.
- Output per token: `avgCost`, `realizedPnl`, `basisQuality`, diagnostics. `basisQuality` and diagnostics persist via the existing `brokeragePositionExtensions` EAV table; Holdings already renders diagnostic rows.
- *Why pure module*: testable against fixture ledgers; independent of sync timing; re-runnable when deep sync backfills late records.
- *Alternative considered*: FIFO lots — rejected per scope decision (weighted average matches Tiger's avgCost semantics).

### D5: Ledger classification mirrors the Tiger `classifyFundType` pattern

`fetchFundDetails` merges three sources into `BrokerageFundDetail` records:

1. `private/get-transactions` journal entries — `TRADING` → TRADE, `TRADE_FEE` → FEE, `ONCHAIN_DEPOSIT`/`ONCHAIN_WITHDRAWAL` → TRANSFER_IN/TRANSFER_OUT, `AUTO_CONVERSION`/`MANUAL_CONVERSION` → CURRENCY_EXCHANGE, `MARGIN_TRADE_INTEREST` → FEE, `SUBACCOUNT_TX` → TRANSFER_IN/OUT, unrecognized → UNKNOWN (raw type preserved in `rawType`).
2. `private/get-deposit-history` / `private/get-withdrawal-history` → DEPOSIT_WITHDRAWAL (richer status/txid metadata than the journal; deduped against journal entries by content).
3. `private/staking/get-reward-history` → DIVIDEND (the staking-income analogue; `symbol` = underlying token, amount = reward qty × market price, with reward quantity preserved in the record).

Natural keys: `cdc_fund_<journal_id>` / `cdc_fund_dep_<id>` / `cdc_fund_stk_<hash>`; the existing v8 content-dedup migration logic guards overlap-window re-fetches.

### D6: Sync strategy — per-source rate limits, retention-aware backfill

- `SyncOrchestrator`'s flat `RATE_LIMITS` map becomes per-source (`RATE_LIMITS[source][category]`, falling back to defaults). CDC values: `transactions` ≥ 1100 ms (1 req/s endpoints + margin), `fund_details` ≥ 1100 ms, `positions`/`account` ≥ 100 ms (3 req/100 ms tier, throttled conservatively).
- Backfill caps: initial sync clamps `since` to **180 days** (API retention) instead of Tiger's 3650-day default — a `maxLookbackDays` provider capability field on `BrokerageProvider` (optional; Tiger omits it). Staking rewards independently clamp to 180 days.
- Chunking inside the provider: trades in ≤7-day windows; journal/order history paginated by sliding the nanosecond `end_time` cursor, 100 rows/page, until window exhausted (mirrors Tiger's 90-day `TRANSACTIONS_CHUNK_DAYS` pattern).
- The existing 14-day incremental overlap and 7-day periodic deep sync (180-day fund_details re-scan) apply to CDC unchanged — for CDC the deep sync window happens to equal the full retention window, which is fine.
- Cost-basis recompute runs after each successful transactions/fund_details sync for affected tokens.

### D7: Candlesticks for Signals

`fetchHistoricalBars(symbol, period, lookbackDays)` maps period day/week/month → timeframe `1D`/`7D`/`1M` on `public/get-candlestick`, with `count`/`start_ts` sized to `lookbackDays`. Symbol→instrument resolution (`BTC` → `BTC_USD`) uses a cached `public/get-instruments` lookup preferring the USD quote pair. Public endpoints are unsigned and generously rate-limited (100 req/s), so the Signals tab's existing 5-minute cache is more than sufficient.

### D8: Credentials and settings

Credential record `id: 'cdc'` storing `{ apiKey, apiSecret }` through the existing `CredentialManager` (AES-256-GCM) — no schema change. `BrokerageSettingsPage` gains a Crypto.com Exchange section parallel to Tiger's: key/secret fields, "test connection" (calls `private/user-balance`), sync trigger, sync-log status. Settings copy instructs users to create a **read-only** API key (the exchange default) and notes the optional IP whitelist.

## Risks / Trade-offs

- **[CORS — partial]** CORS support is **not uniform across endpoint families** (discovered during a real sync, 2026-06-14; the initial spike only checked `user-balance`). Verified per-endpoint preflight from `http://localhost:5173`:
  - **CORS-enabled** (reflect Origin in `Access-Control-Allow-Origin`): `user-balance`, `get-positions`, `get-trades`, `get-order-history`, `get-transactions`, and all `public/*`. → balances, spot positions, trades, the journal ledger, and candlesticks all work directly from the browser.
  - **CORS-blocked**: the **Wallet API** (`get-deposit-history`, `get-withdrawal-history` — 200 preflight but no ACAO header) and the **entire Staking API** (`staking/get-reward-history`, `staking/get-staking-position` — 403 on the preflight). → unreachable from a browser.
  - *Impact*: staking rewards (the Dividends "income" feature) and deposit/withdrawal txid/fee enrichment can't be fetched browser-only. Transfers still arrive via the journal's `ONCHAIN_*` entries, so no transfer data is lost — only the staking-reward records and wallet enrichment.
  - *Mitigation*: these two families are gated behind `CdcProvider`'s `enableProxiedEndpoints` flag, **off by default**, so they're not even attempted (no console CORS errors). They become available when requests are routed through a same-origin proxy (the `CdcClientConfig.serverUrl` transport seam supports this). A `TypeError`/`CdcAuthError` safety net still degrades gracefully if an enabled endpoint fails. Per the user's decision (2026-06-14), staking is **deferred** — shipped browser-only without it.
- **[6-month wall]** New users cannot backfill more than ~6 months of trades; cost basis for older accumulation is unknowable from the API. → `basisQuality = 'incomplete'` diagnostics; reconciliation against authoritative balances (D4); future CSV-import escape hatch (out of scope here).
- **[Backfill duration]** Initial 180-day backfill at 1 req/s with 7-day windows ≈ 26+ requests minimum, more with pagination — minutes for active accounts. → existing per-category progress reporting in the sync UI. Checkpointing is category-level (the architecture is fetch-all-then-persist): a mid-backfill failure persists nothing for that category, the checkpoint doesn't advance, and the next sync re-covers the window — no data loss, at the cost of re-fetching on retry.
- **[Estimated deposit basis]** Market-price-at-deposit uses a daily candle close, not the actual acquisition price. → always flagged `estimated`; documented in the Holdings diagnostic.
- **[Quantity drift]** Computed ledger quantity may diverge from `user-balance` (dust, fee-in-kind, AUTO_CONVERSION edge cases). → tolerance-based reconciliation with synthetic adjustment events, surfaced as diagnostics rather than silent correction.
- **[Unified-margin framing]** `total_cash_balance` mixes realized PnL and fees; there is no plain "spot wallet" number. → `fetchAccount` maps `total_cash_balance` → cashBalance and `total_cash_balance + Σ market values` → netLiquidation, documented as the closest equivalents.
- **[API evolution]** CDC has an active breaking-change schedule (e.g. trigger orders moving to the Advanced Order API). → we use none of the affected endpoints; client logs unrecognized response shapes as warnings rather than failing the sync.

## Open Questions

- ~~CORS behavior of `api.crypto.com` from browsers~~ Resolved: CORS fully permitted (see Risks).
- Whether staking rewards should also create synthetic basis events (reward coins acquired at zero cost vs market price). Initial position: market price at reward date, consistent with the deposit decision, flagged `estimated`.
