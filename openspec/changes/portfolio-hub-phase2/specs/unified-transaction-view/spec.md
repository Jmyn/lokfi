## MODIFIED Requirements

### Requirement: Unified transaction table renders both bank and brokerage rows
The system SHALL display brokerage transactions in the existing `TransactionTable` alongside bank transactions without adding new columns.

#### Scenario: Brokerage BUY row rendering in portfolio context
- **WHEN** a brokerage BUY transaction is rendered in the table
- **THEN** the Description column shows `"BUY {symbol} — {qty} shares @ {price}"`
- **AND** the Amount is rendered in neutral gray color
- **AND** the Source column shows `📈 {brokerageName}`
- **AND** the Category column shows `—`
- **AND** the checkbox is disabled

#### Scenario: Brokerage DIVIDEND row rendering in portfolio context
- **WHEN** a brokerage DIVIDEND transaction is rendered in the table
- **THEN** the Description column shows `"{symbol} Dividend"`
- **AND** the Amount is rendered in green color
- **AND** the Source column shows `📈 {brokerageName}`
- **AND** the Category column shows `—`

#### Scenario: Bank transaction rendering is unchanged
- **WHEN** a bank transaction is rendered in the unified table
- **THEN** all existing formatting, colors, and interactions remain identical to pre-change behavior

## ADDED Requirements

### Requirement: Portfolio transactions tab shows enhanced columns
The system SHALL display additional columns when viewing transactions in the portfolio context.

#### Scenario: Portfolio Transactions tab active
- **WHEN** the Transactions tab within `/portfolio` is active
- **THEN** the table includes columns: Date, Description, Type, Symbol, Quantity, Price, Amount, Source, Category
- **AND** the Type column shows a badge: BUY (green), SELL (red), DIVIDEND (amber), FEE (gray)
- **AND** Symbol, Quantity, and Price are blank for bank transactions

#### Scenario: Type badge rendering
- **WHEN** a brokerage BUY row is rendered
- **THEN** the Type badge is green and shows "BUY"
- **AND** a SELL badge is red
- **AND** a DIVIDEND badge is amber
- **AND** a FEE badge is gray

### Requirement: Dividend rows link to bank transactions
The system SHALL show a link indicator when a dividend corp action may correspond to a bank deposit.

#### Scenario: Potential dividend match exists
- **WHEN** a DIVIDEND row is rendered and a bank transaction with matching amount and date exists
- **THEN** a chain/link icon appears in the row
- **AND** clicking the icon navigates to the linked bank transaction

#### Scenario: No match found
- **WHEN** a DIVIDEND row is rendered and no matching bank transaction exists
- **THEN** no link icon is shown
