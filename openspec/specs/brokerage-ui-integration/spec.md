# brokerage-ui-integration Specification

## Purpose
TBD - created by archiving change portfolio-tracking-phase1. Update Purpose after archive.
## Requirements
### Requirement: Brokerage data is read from Dexie and mapped to UI rows
The system SHALL read synced brokerage data from Dexie tables and map each record type to a standardized UI row shape for rendering.

#### Scenario: Transaction mapping
- **WHEN** a `BrokerageTransaction` record is read from `db.brokerageTransactions`
- **THEN** it is mapped to a `UnifiedRow` with fields: `id`, `source`, `date`, `description`, `amount`, `type`, `symbol`, `quantity`, `price`, `currency`

#### Scenario: Corporate action mapping
- **WHEN** a `BrokerageCorpAction` record is read from `db.brokerageCorpActions`
- **THEN** it is mapped to a `UnifiedRow` with `type` set to `DIVIDEND`, `SPLIT`, `RIGHTS`, or `OTHER` based on the corp action type
- **AND** the `amount` reflects the dividend amount or adjustment value

#### Scenario: Fee mapping
- **WHEN** a brokerage transaction with `action: 'FEE'` or commission data is present
- **THEN** it is mapped to a `UnifiedRow` with `type: 'FEE'` and negative `amount`

### Requirement: Source icons distinguish bank and brokerage origins
The system SHALL render a visual icon prefix in the Source column to differentiate bank transactions from brokerage transactions.

#### Scenario: Bank source icon
- **WHEN** a bank transaction is rendered
- **THEN** the Source column displays `🏦 {bankName}`

#### Scenario: Brokerage source icon
- **WHEN** a brokerage transaction is rendered
- **THEN** the Source column displays `📈 {brokerageName}`

### Requirement: Amount formatting respects transaction type semantics
The system SHALL render brokerage transaction amounts with colors that reflect their financial nature, distinct from bank transaction semantics.

#### Scenario: BUY/SELL neutral color
- **WHEN** a brokerage BUY or SELL transaction is rendered
- **THEN** the amount is displayed in neutral gray (not red or green)
- **AND** the sign prefix (`−` or `+`) is still shown

#### Scenario: DIVIDEND green color
- **WHEN** a brokerage DIVIDEND transaction is rendered
- **THEN** the amount is displayed in green (same as bank income)

#### Scenario: FEE red color
- **WHEN** a brokerage FEE transaction is rendered
- **THEN** the amount is displayed in red (same as bank spending)

#### Scenario: Bank transaction colors unchanged
- **WHEN** a bank transaction is rendered
- **THEN** its amount color follows existing rules (red for negative, green for positive)

