# portfolio-holdings Specification

## Purpose
TBD - created by archiving change portfolio-hub-phase2. Update Purpose after archive.
## Requirements
### Requirement: Holdings tab displays all positions in a grouped table
The system SHALL display a table of all positions grouped by currency, with columns for symbol, quantity, average cost, market price, market value, and unrealized P&L.

#### Scenario: Positions exist in multiple currencies
- **WHEN** the Holdings tab is active and positions exist
- **THEN** positions are grouped into collapsible sections by currency (e.g., "USD Holdings", "SGD Holdings")
- **AND** each row shows: Symbol, Qty, Avg Cost, Mkt Price, Mkt Value, and P&L
- **AND** P&L is color-coded green for positive, red for negative
- **AND** a search input filters rows by symbol or name

#### Scenario: Position has market value from sync
- **WHEN** a `BrokeragePosition` has a `marketValue` field
- **THEN** the Mkt Value column displays that value
- **AND** the Mkt Price is computed as `marketValue / quantity`

#### Scenario: Position lacks market value
- **WHEN** a `BrokeragePosition` has no `marketValue`
- **THEN** the Mkt Value falls back to `quantity × avgCost`
- **AND** a tooltip or asterisk indicates this is an estimated value

### Requirement: Holdings tab supports expandable row detail
The system SHALL allow users to click a holdings row to expand and see detailed information.

#### Scenario: User expands a row
- **WHEN** a user clicks on a holdings row
- **THEN** the row expands to show: full name, raw cost basis, adjusted cost basis (with Phase 3 note), day range, 52-week range, and action buttons
- **AND** two action buttons are shown: "View Transactions" and "View Corp Actions"
- **AND** clicking "View Transactions" navigates to the Transactions tab with the symbol pre-filtered

### Requirement: Holdings tab handles empty state
The system SHALL show an empty state when no positions exist.

#### Scenario: No positions synced
- **WHEN** the Holdings tab is active and `brokeragePositions` is empty
- **THEN** a message is displayed: "No holdings yet. Sync your account to see your positions."
- **AND** a button links to `/settings/brokerage`

