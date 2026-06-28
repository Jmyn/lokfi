# Spec: cdc-sync-integration

## ADDED Requirements

### Requirement: Per-source rate limits in the orchestrator
The sync orchestrator SHALL support per-source, per-category minimum request spacing instead of a single global map. CDC categories MUST be spaced at: transactions ≥ 1100 ms, fund_details ≥ 1100 ms, positions and account ≥ 100 ms. Tiger's existing spacing values MUST remain unchanged.

#### Scenario: CDC trades throttled
- **WHEN** the CDC transactions category issues consecutive requests
- **THEN** at least 1100 ms elapse between requests

#### Scenario: Tiger unaffected
- **WHEN** a Tiger sync runs after the change
- **THEN** Tiger's request spacing matches its previous per-category values

### Requirement: Retention-aware backfill clamp
The orchestrator SHALL respect an optional `maxLookbackDays` capability declared by a provider: when computing the initial (never-synced) `since` date, the lookback MUST be clamped to the provider's `maxLookbackDays`. The CDC provider declares 180 days. Providers that do not declare it (Tiger) MUST keep the existing 3650-day default.

#### Scenario: First CDC sync clamps lookback
- **WHEN** a CDC category has never been synced
- **THEN** the computed `since` is no older than 180 days before now

#### Scenario: Incremental sync unaffected by clamp
- **WHEN** a CDC category was last synced 3 days ago
- **THEN** the computed `since` is last-sync minus the standard 14-day overlap

### Requirement: Resumable chunked backfill
CDC history fetches SHALL report per-chunk progress through the existing provider progress callback. A failure partway through a backfill MUST NOT lose or corrupt previously persisted records (append-only tables with content dedup), MUST be recorded in the sync log, and MUST NOT advance the category's incremental checkpoint — so the next sync re-covers the failed window automatically. (Checkpointing is category-level: a failed category's whole window is re-fetched on retry; per-chunk checkpoints are not maintained.)

#### Scenario: Interrupted backfill resumes
- **WHEN** a transactions backfill fails partway through
- **THEN** previously persisted transactions remain intact, the sync log records the failure, and the next sync's computed `since` still reflects the last successful sync (the failed window is re-covered, with dedup preventing duplicates)

### Requirement: Crypto.com connection settings
The brokerage settings page SHALL provide a Crypto.com Exchange section parallel to Tiger's: API key and secret inputs, save-encrypted via the existing credential manager under id `cdc`, a test-connection action calling `validateConnection`, a manual sync trigger, and per-category sync status/error display. The section MUST instruct the user to create a read-only API key.

#### Scenario: Credentials saved and validated
- **WHEN** the user enters a valid API key/secret and clicks test connection
- **THEN** a success indicator is shown and the credentials are stored encrypted under id `cdc`

#### Scenario: Invalid credentials rejected with guidance
- **WHEN** the test-connection call fails authentication
- **THEN** an error message identifying a credential problem (not a generic failure) is displayed and nothing is stored as validated

#### Scenario: CDC data flows into existing tabs
- **WHEN** a CDC sync completes successfully
- **THEN** CDC positions appear in Holdings, are counted in the Overview total value and bucket charts, ledger records appear in the unified Transactions view, and CDC symbols are selectable in the Signals tab (staking rewards appear in Dividends only when proxied endpoints are enabled)

### Requirement: Crypto positions render as holdings
`CRYPTO` positions SHALL be classified as stock-like for display and aggregation — appearing in the main Holdings section (not the Derivatives section), counted in the Overview total portfolio value, included in the portfolio-by-bucket chart, and assignable to buckets. This classification MUST be single-sourced so a newly added security type cannot fall through both the stock-like and derivative filters and vanish from the UI.

#### Scenario: Crypto holding visible in Holdings
- **WHEN** a `CRYPTO` position is synced
- **THEN** it renders in the Holdings section with its quantity, market value, and computed cost basis, and contributes to the Overview total value

#### Scenario: Crypto holding assignable to a bucket
- **WHEN** the user opens a `CRYPTO` holding's bucket control
- **THEN** the position can be assigned to a portfolio bucket like any stock-like holding
