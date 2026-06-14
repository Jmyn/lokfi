# Tasks: cdc-exchange-integration

## 1. Spike & Foundations

- [x] 1.1 CORS spike: from the browser app, call `public/get-tickers` and a signed `private/user-balance` against `api.crypto.com/exchange/v1`; document result. If blocked, add a Vite dev-proxy route and a transport-layer base-URL switch in the client design, then re-verify
- [x] 1.2 Add `'CRYPTO'` to the `SecType` union and optional `maxLookbackDays` capability field to `BrokerageProvider` in `packages/brokerage-core`; verify no type regressions across the app
- [x] 1.3 Create `apps/web/src/lib/brokerage/cdc/cdc-types.ts` with request/response types for the endpoints in scope (user-balance, get-trades, get-transactions, deposit/withdrawal history, staking reward history, staking position, get-instruments, get-candlestick)

## 2. HTTP Client (HMAC signing)

- [x] 2.1 Implement `cdc-http-client.ts`: params-string canonicalization (sorted keys, recursive `key+value` concat), HMAC-SHA256 via Web Crypto, POST envelope `{id, method, api_key, params, nonce, sig}`, numeric-as-string serialization, public (unsigned) vs private (signed) execution paths
- [x] 2.2 Map exchange error codes to typed errors distinguishing credential/permission failures from transient/network failures
- [x] 2.3 Unit tests for signature canonicalization (including nested params and numeric strings) against the documented example payloads

## 3. Provider — balances, positions, candlesticks

- [x] 3.1 Implement `fetchAccount`: `private/user-balance` → `BrokerageAccount` (`cdc_USD`, total_cash_balance → cashBalance, cash + position market values → netLiquidation)
- [x] 3.2 Implement `fetchPositions`: `position_balances[]` → `BrokeragePosition` (secType CRYPTO, bare-token symbols, zero-quantity filtering, `*.staked` as distinct positions with staked extension flag); basis fields left unset for the engine
- [x] 3.3 Implement `validateConnection` via lightweight `user-balance` call (true/false, no throw)
- [x] 3.4 Implement instrument resolution: cached `public/get-instruments` lookup, token → preferred USD-quoted pair
- [x] 3.5 Implement `fetchHistoricalBars`: period→timeframe mapping (1D/7D/1M), start_ts/count sizing for lookbackDays, oldest-first OHLCV bars; verify 91-day daily fetch for Signals
- [x] 3.6 Adapter unit tests for 3.1–3.5 with fixture responses

## 4. Provider — trades & ledger

- [x] 4.1 Implement `fetchTransactions`: `private/get-trades` with ≤7-day windows, ns-timestamp cursor pagination (≤100 rows/req), ≥1.1 s spacing, fill → `BrokerageTransaction` (id `cdc_<trade_id>`, pair symbol, side, qty, price, fee as commission); per-chunk progress callbacks
- [x] 4.2 Implement journal sync: `private/get-transactions` with cursor pagination → fund details via journal-type classifier (TRADING/TRADE_FEE/ONCHAIN_*/CONVERSION/MARGIN_TRADE_INTEREST/SUBACCOUNT_TX mappings, UNKNOWN fallback preserving rawType)
- [x] 4.3 Implement deposit/withdrawal history sync (page-based, completed entries → DEPOSIT_WITHDRAWAL with txid/fee metadata), content-dedup against journal `ONCHAIN_*` entries, graceful degradation with sync-log warning when permission-gated
- [x] 4.4 Implement staking reward sync: `private/staking/get-reward-history` clamped to 180 days → DIVIDEND fund details (underlying symbol, reward qty preserved, USD amount from event-date price)
- [x] 4.5 Classifier + adapter unit tests covering every documented journal type, dedup, and the permission-gated path

## 5. Spot cost-basis engine

- [x] 5.1 Implement `spot-cost-basis.ts` as a pure module: event model (BUY/SELL/DEPOSIT/WITHDRAWAL/ADJUSTMENT), weighted-average state transitions with fees in basis, proportional sell-down, realized P&L accumulation, basis-quality flag (ok/estimated/incomplete)
- [x] 5.2 Implement deposit valuation: daily-candle close lookup at event date (cached per token+date), zero-cost + `incomplete` fallback on lookup failure; staking rewards enter as market-priced acquisitions flagged `estimated`
- [x] 5.3 Implement reconciliation: compare computed vs authoritative quantity, 0.1% relative tolerance, synthetic adjustment events with diagnostics
- [x] 5.4 Comprehensive unit tests: fixture ledgers for buy/sell sequences, fee handling, deposits, withdrawals, divergence reconciliation, dust tolerance
- [x] 5.5 Wire enrichment into the sync pipeline: after CDC transactions + fund_details persist, recompute basis per affected token, update stored positions (avgCost, unrealizedPnl, unrealizedPnlPercent) and write basis-quality/diagnostic position extensions; trigger recompute after deep sync

## 6. Sync orchestration & settings

- [x] 6.1 Refactor `RATE_LIMITS` to per-source per-category map with defaults; CDC: transactions/fund_details ≥1100 ms, positions/account ≥100 ms; assert Tiger values unchanged via existing tests
- [x] 6.2 Implement `maxLookbackDays` clamp in `computeIncrementalSince` (CDC 180 days; Tiger keeps 3650-day default); unit tests for first-sync clamp and incremental overlap interplay
- [x] 6.3 Register `CdcProvider` in provider instantiation (replace `cdc-stub.ts`), keyed off stored `cdc` credentials
- [x] 6.4 Add Crypto.com Exchange section to `BrokerageSettingsPage`: API key/secret inputs, encrypted save under id `cdc`, test-connection with credential-specific error messaging, manual sync trigger, per-category status; copy instructing read-only key creation
- [x] 6.5 Verify interrupted-backfill resumability: failure doesn't advance the incremental checkpoint (category-level resume; spec + design amended to match the fetch-all-then-persist architecture)

## 7. End-to-end verification

- [~] 7.1 Full sync against a real account — **blocked on user-supplied API credentials.** Verified instead: live public API path (`fetchHistoricalBars`/`getDailyClose` against real `api.crypto.com`), browser CORS for signed private POSTs (spike 1.1), and the full private path (balances, positions, trades, ledger, staking, dedup, permission-gated fallback) via unit tests with realistic mocked responses matching the live/ documented schemas. Authenticated sync against a real or UAT account is the one step that needs the user's key/secret.
- [~] 7.2 UI walkthrough — **blocked on real CDC data (needs credentials).** Verified instead: production build + typecheck pass; settings section, Holdings basis diagnostics, multi-source sync, and Signals provider resolution are wired and unit-tested. A click-through with live data is pending the user connecting an account.
- [x] 7.3 Run full test suite + lint (`pnpm test`, biome) — 318 web tests pass, biome clean, production build succeeds; updated `apps/docs/guide/investments.md` with the Crypto.com connection section, staking-reward note, and basis-estimation caveats
