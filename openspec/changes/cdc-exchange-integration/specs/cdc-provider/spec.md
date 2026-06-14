# Spec: cdc-provider

## ADDED Requirements

### Requirement: HMAC-signed API client
The system SHALL provide a Crypto.com Exchange v1 HTTP client that signs private requests with HMAC-SHA256 per the exchange specification: signature payload `method + id + api_key + paramsString + nonce` where `paramsString` concatenates params sorted by key ascending as `key+value` (applied recursively to nested objects), signed with the API secret, hex-encoded. All private calls MUST be POSTs with JSON body `{id, method, api_key, params, nonce, sig}`, numeric parameter values MUST be serialized as strings, and the nonce MUST be the current epoch milliseconds.

#### Scenario: Signed private request succeeds
- **WHEN** the client executes `private/user-balance` with valid credentials
- **THEN** the request body contains a valid `sig` and the parsed result payload is returned

#### Scenario: Authentication failure surfaces a clear error
- **WHEN** the exchange responds with an authentication/permission error code
- **THEN** the client throws an error identifying the failure as credential-related (not a generic network error)

#### Scenario: Public endpoints are unsigned
- **WHEN** the client executes a `public/*` method
- **THEN** no signature or API key is attached to the request

### Requirement: Provider implements the BrokerageProvider interface
The system SHALL provide a `CdcProvider` with `source: 'cdc'` implementing all `BrokerageProvider` methods (`fetchPositions`, `fetchTransactions`, `fetchFundDetails`, `fetchAccount`, `fetchHistoricalBars`, `validateConnection`), replacing the existing `CdcStubProvider`.

#### Scenario: Provider registration
- **WHEN** valid CDC credentials are stored and a sync is triggered
- **THEN** the sync orchestrator runs the real `CdcProvider` (not the stub) for all categories

#### Scenario: Connection validation
- **WHEN** `validateConnection()` is called with valid credentials
- **THEN** it performs a lightweight `private/user-balance` call and resolves `true`
- **WHEN** called with invalid credentials
- **THEN** it resolves `false` without throwing

### Requirement: Spot positions from user balance
`fetchPositions` SHALL map each entry of `private/user-balance` → `position_balances[]` to a normalized `BrokeragePosition` with `source: 'cdc'`, `secType: 'CRYPTO'`, symbol = bare token (e.g. `BTC`), quantity, and market value. Staked instruments (e.g. `SOL.staked`) MUST be represented as distinct positions carrying a staked indicator, with symbol = underlying token. Positions with zero quantity MUST be excluded.

#### Scenario: Spot token mapped
- **WHEN** `position_balances` contains `{instrument_name: "BTC", quantity: "0.5", market_value: "30000"}`
- **THEN** a position with symbol `BTC`, secType `CRYPTO`, quantity 0.5, marketValue 30000 is returned

#### Scenario: Staked asset distinguished from spot
- **WHEN** `position_balances` contains both `SOL` and `SOL.staked`
- **THEN** two distinct positions are returned, and the staked one is identifiable as staked (distinct id and staked indicator)

### Requirement: Trade history as transactions
`fetchTransactions(since)` SHALL fetch fills from `private/get-trades` in time windows of at most 7 days, paginating each window via the timestamp cursor with at most 100 rows per request, and map each fill to a `BrokerageTransaction` with id `cdc_<trade_id>`, the instrument pair as symbol, side (BUY/SELL), traded quantity, traded price, fee as commission, and execution time. Requests to this endpoint MUST be spaced at least 1 second apart.

#### Scenario: Window chunking
- **WHEN** `since` is 30 days ago
- **THEN** the provider issues multiple `get-trades` calls each covering ≤7 days until the full range is covered

#### Scenario: Pagination within a window
- **WHEN** a 7-day window contains more than 100 fills
- **THEN** the provider slides the time cursor and re-queries until all fills in the window are retrieved, without duplicates

### Requirement: Account summary
`fetchAccount` SHALL map `private/user-balance` to normalized `BrokerageAccount` records with `source: 'cdc'`: cash balance from `total_cash_balance` and net liquidation from total account value (cash + position market values), denominated in USD.

#### Scenario: Account record produced
- **WHEN** `fetchAccount` succeeds
- **THEN** at least one account record with id `cdc_USD`, a cash balance, and a net liquidation value is returned

### Requirement: Historical candlesticks for signals
`fetchHistoricalBars(symbol, period, lookbackDays)` SHALL resolve the token symbol to a tradable instrument (preferring the USD-quoted pair) via a cached `public/get-instruments` lookup, fetch `public/get-candlestick` with timeframe `1D`/`7D`/`1M` for period day/week/month respectively, and return bars covering at least `lookbackDays`, sorted oldest-first with epoch-millisecond timestamps and OHLCV values.

#### Scenario: Signals lookback satisfied
- **WHEN** `fetchHistoricalBars('BTC', 'day', 91)` is called
- **THEN** at least 91 daily bars for the BTC/USD instrument are returned in chronological order

#### Scenario: Unknown symbol
- **WHEN** the symbol cannot be resolved to any instrument
- **THEN** the method throws a descriptive error naming the symbol
