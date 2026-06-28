# brokerage-settings Specification

## Purpose
TBD - created by archiving change portfolio-tracking-phase1. Update Purpose after archive.
## Requirements
### Requirement: Users can configure brokerage API credentials and sync settings
The system SHALL provide a settings page where users can enter brokerage credentials, test connectivity, trigger manual sync, and configure sync behavior.

#### Scenario: Save credentials and test connection
- **WHEN** a user enters Tiger Brokers API credentials and clicks "Test Connection"
- **THEN** the system encrypts and stores credentials via `CredentialManager`
- **AND** calls `provider.validateConnection()`
- **AND** displays success or error status to the user

#### Scenario: Trigger manual sync
- **WHEN** a user clicks "Sync Now" on the brokerage settings page
- **THEN** the system retrieves stored credentials
- **AND** constructs a `SyncOrchestrator` with the configured `lookbackDays`
- **AND** executes `sync()` across all categories
- **AND** displays per-category success/failure status

#### Scenario: Disconnect brokerage
- **WHEN** a user clicks "Disconnect"
- **THEN** the system removes encrypted credentials from `CredentialManager`
- **AND** deletes all synced data from brokerage Dexie tables
- **AND** updates the UI to show "Not connected" status

### Requirement: Users can configure sync lookback window
The system SHALL allow users to set how many days of historical brokerage data to sync, stored in `db.settings` and applied on every sync.

#### Scenario: Default lookback is 90 days
- **WHEN** a brokerage is connected for the first time
- **THEN** the default lookback days is 90
- **AND** the settings page shows "90 days" as the current value

#### Scenario: Change lookback days
- **WHEN** a user changes the lookback days from 90 to 180 and saves
- **THEN** the system stores `brokerage:tiger:lookbackDays = "180"` in `db.settings`
- **AND** the next sync fetches 180 days of transaction and corporate action history

#### Scenario: Lookback days used by sync orchestrator
- **WHEN** a sync is triggered with lookback days set to 30
- **THEN** the `SyncOrchestrator` calculates `since = new Date(Date.now() - 30 days)`
- **AND** passes that `since` date to `provider.fetchTransactions(since)` and `provider.fetchCorpActions(since)`

