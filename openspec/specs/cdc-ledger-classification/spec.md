# cdc-ledger-classification Specification

## Purpose
TBD - created by archiving change cdc-exchange-integration. Update Purpose after archive.
## Requirements
### Requirement: Journal entries classified into fund details
`fetchFundDetails(since)` SHALL fetch `private/get-transactions` journal entries and map each to a `BrokerageFundDetail` with id `cdc_fund_<journal_id>`, preserving the raw journal type in `rawType` and classifying into the existing `FundDetailType` taxonomy: `TRADING` → TRADE, `TRADE_FEE` → FEE, `ONCHAIN_DEPOSIT` → TRANSFER_IN, `ONCHAIN_WITHDRAWAL` → TRANSFER_OUT, `AUTO_CONVERSION` and `MANUAL_CONVERSION` → CURRENCY_EXCHANGE, `MARGIN_TRADE_INTEREST` → FEE, `SUBACCOUNT_TX` → TRANSFER_IN or TRANSFER_OUT by sign. Unrecognized journal types MUST classify as UNKNOWN without failing the sync.

#### Scenario: Trade fee classified
- **WHEN** a journal entry has `journal_type: "TRADE_FEE"` with a negative amount
- **THEN** a fund detail with classifiedType FEE and the signed amount is produced

#### Scenario: Unknown journal type tolerated
- **WHEN** a journal entry has a journal type not in the mapping table
- **THEN** a fund detail with classifiedType UNKNOWN and the raw type preserved is produced, and the sync continues

### Requirement: Deposit and withdrawal history merged
`fetchFundDetails` SHALL additionally fetch `private/get-deposit-history` and `private/get-withdrawal-history` (page-based, max 200 per page) and map completed entries to DEPOSIT_WITHDRAWAL fund details carrying currency, amount (signed: deposits positive, withdrawals negative), fee, and transaction id metadata. Entries that duplicate an on-chain journal entry MUST be deduplicated by content so the ledger shows one record per transfer. If these endpoints are unavailable for the API key (permission-gated), the sync MUST continue with journal-derived transfers only and record a non-fatal warning.

#### Scenario: Completed withdrawal recorded once
- **WHEN** a withdrawal appears in both `get-withdrawal-history` (status Completed) and the journal as `ONCHAIN_WITHDRAWAL`
- **THEN** exactly one fund detail represents that transfer after dedup

#### Scenario: Permission-gated endpoint missing
- **WHEN** `get-deposit-history` returns a permission error
- **THEN** fund details sync completes using journal entries only and the warning is recorded in the sync log

### Requirement: Staking rewards as dividend analogue
When staking-endpoint access is enabled (see below), `fetchFundDetails` SHALL fetch `private/staking/get-reward-history` (clamped to the API's 180-day maximum lookback) and map each reward event to a fund detail with classifiedType DIVIDEND, symbol = underlying token, amount = reward quantity valued at the token's market price on the event date, and the raw reward quantity preserved in the record.

The Staking endpoint family does NOT send CORS headers (its preflight returns 403), so it is unreachable from a browser. Accordingly it is gated behind the provider's `enableProxiedEndpoints` flag, which defaults to **off**: in the default browser-only build staking rewards are NOT fetched and `fetchFundDetails` returns the journal-derived ledger only. The flag is enabled when requests are routed through a same-origin proxy.

#### Scenario: Staking skipped in the default browser-only build
- **WHEN** a sync runs with `enableProxiedEndpoints` off (the default)
- **THEN** `private/staking/get-reward-history` is not called, no DIVIDEND records are produced from staking, and progress reports that staking rewards were skipped

#### Scenario: Staking reward appears when proxied endpoints are enabled
- **WHEN** `enableProxiedEndpoints` is on and a reward event of 0.1 SOL is returned with an event timestamp
- **THEN** a fund detail with classifiedType DIVIDEND, symbol SOL, and a USD amount based on the event-date price is produced

#### Scenario: Lookback clamped
- **WHEN** `enableProxiedEndpoints` is on and `since` is older than 180 days
- **THEN** the staking reward request uses a start time no older than 180 days and the clamp is reflected in progress reporting

