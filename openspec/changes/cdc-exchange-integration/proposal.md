# Proposal: Crypto.com Exchange Integration

## Why

The portfolio hub currently tracks only Tiger Brokers accounts. Crypto.com Exchange holdings (spot coins, staked assets, trade history) are invisible, so users with crypto on the exchange have an incomplete net-worth and P&L picture. The `BrokerageProvider` abstraction and a `CdcStubProvider` placeholder already exist — the architecture was built for this, and the Crypto.com Exchange v1 API has been verified to cover all required data categories (with two structural gaps that need client-side workarounds: no spot cost basis, and 6-month history retention).

## What Changes

- Replace `cdc-stub.ts` with a full `CdcProvider` implementing the `BrokerageProvider` interface against the Crypto.com Exchange v1 REST API (`https://api.crypto.com/exchange/v1/`).
- New HMAC-SHA256 request signing client (analogous to the existing RSA-based `tiger-http-client.ts`), using API key + secret stored via the existing encrypted `CredentialManager`.
- Spot holdings synced from `private/user-balance` → `position_balances[]`; staked assets (`*.staked` instruments) mapped to positions or surfaced alongside spot.
- Trade history synced from `private/get-trades` (7-day windows, 1 req/s throttle); orders from `private/get-order-history`.
- Account ledger synced from `private/get-transactions` (journal types), `private/get-deposit-history` / `private/get-withdrawal-history`, and `private/staking/get-reward-history` — classified into the existing `FundDetailType` taxonomy (staking rewards → DIVIDEND analogue).
- New client-side **spot cost-basis engine**: weighted-average cost computed from synced trades; transferred-in coins valued at market price on deposit date (from candlesticks) and flagged with a diagnostic. Crypto.com's API provides no cost basis for spot holdings, so positions are enriched before storage.
- Historical candlesticks from `public/get-candlestick` powering the Signals tab (9 Sig Lite) for crypto instruments.
- Sync orchestration extended with CDC-specific rate limits and a chunked backfill strategy bounded by the API's 6-month history retention; continuous incremental sync (existing 14-day overlap) becomes the mechanism for accumulating history beyond 6 months.
- Brokerage settings UI gains a Crypto.com Exchange connection section (API key/secret entry, validation, sync trigger).

Out of scope (per scope decision): derivatives positions (`private/get-positions`), margin/funding-rate tracking, trading/withdrawal actions (read-only integration), Crypto.com App data (only Exchange API).

## Capabilities

### New Capabilities

- `cdc-provider`: Crypto.com Exchange API client (HMAC-SHA256 signing, rate-limit-aware) and `CdcProvider` implementation of `BrokerageProvider` — balances/accounts, spot + staked positions, transactions, historical candlesticks, connection validation.
- `cdc-ledger-classification`: Mapping of Crypto.com journal types, deposit/withdrawal records, and staking reward events into normalized `BrokerageFundDetail` records using the existing `FundDetailType` taxonomy.
- `spot-cost-basis`: Weighted-average cost-basis engine that reconstructs avgCost and unrealized P&L for spot holdings from trade and transfer history, with market-price-at-deposit valuation and diagnostics for estimated/incomplete basis.
- `cdc-sync-integration`: CDC registration in the sync orchestrator (rate limits, category chunking, 6-month-retention-aware backfill) and the Crypto.com connection section in brokerage settings (credential entry, validation, sync status).

### Modified Capabilities

<!-- No existing specs in openspec/specs/; prior change specs (brokerage-settings, unified-transaction-view) are archived per-change artifacts. UI integration requirements are captured in cdc-sync-integration. -->

None.

## Impact

- **New code**: `apps/web/src/lib/brokerage/cdc/` (client, provider, adapters, classifier, cost-basis engine, tests) — replaces `cdc-stub.ts`.
- **Modified code**: `apps/web/src/lib/brokerage/sync-orchestrator.ts` (per-source rate limits), `apps/web/src/pages/settings/BrokerageSettingsPage.tsx` (CDC credentials section), provider registry/instantiation, `packages/brokerage-core` types if CDC needs new fields (e.g., basis-quality flag on positions).
- **Database**: no new tables expected — existing `brokeragePositions`, `brokerageTransactions`, `brokerageFundDetails`, `brokerageAccounts`, `brokerageSyncLog`, `brokerageCredentials` tables are source-discriminated; position diagnostics use the existing `brokeragePositionExtensions` EAV table. Credential record gains `id: 'cdc'`.
- **External dependency**: Crypto.com Exchange v1 REST API; no SDK added (direct client, matching the Tiger pattern). Web Crypto API HMAC (browser-native, no new packages).
- **User-facing**: Holdings, Overview, Dividends (staking rewards), unified Transactions, and Signals tabs gain Crypto.com data automatically via the normalized model.
- **Constraints inherited from the API**: trades/orders/ledger retention is 6 months (initial backfill cannot go deeper); deposit/withdrawal history is master-account-only and permission-gated; spot cost basis is computed, not authoritative.
