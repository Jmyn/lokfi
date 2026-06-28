# unified-transaction-view Specification

## Purpose
TBD - created by archiving change portfolio-tracking-phase1. Update Purpose after archive.
## Requirements
### Requirement: Users can filter transactions by source type
The system SHALL provide a tabbed filter on the `/transactions` page allowing users to switch between `All`, `Bank`, and `Brokerage` source type views.

#### Scenario: Default view shows all transactions
- **WHEN** a user navigates to the `/transactions` page
- **THEN** the "All" tab is active by default and both bank and brokerage transactions are visible

#### Scenario: Bank-only filter
- **WHEN** a user clicks the "Bank" tab
- **THEN** only bank transactions are displayed and the Type filter dropdown is hidden

#### Scenario: Brokerage-only filter
- **WHEN** a user clicks the "Brokerage" tab
- **THEN** only brokerage transactions are displayed and the Category filter dropdown is hidden

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

### Requirement: Unified query layer merges and paginates cross-table data
The system SHALL provide a `useUnifiedTransactions` hook that queries both bank and brokerage tables, merges results into a common shape, sorts by date descending, and supports pagination.

#### Scenario: Query returns merged sorted results
- **WHEN** the hook is called with filters and pagination parameters
- **THEN** it queries `db.transactions` and `db.brokerageTransactions` + `db.brokerageCorpActions`
- **AND** returns a single array sorted by date descending
- **AND** respects the provided offset and page size

#### Scenario: Brokerage-only query skips bank table
- **WHEN** the "Brokerage" source type tab is active
- **THEN** the hook queries only brokerage tables (not `db.transactions`)
- **AND** bank transactions are not fetched

#### Scenario: Bank-only query skips brokerage tables
- **WHEN** the "Bank" source type tab is active
- **THEN** the hook queries only `db.transactions`
- **AND** brokerage tables are not fetched

### Requirement: Brokerage rows are non-interactive for category features
The system SHALL disable category editing, bulk selection, and rule suggestion features for brokerage rows.

#### Scenario: Brokerage row checkbox disabled
- **WHEN** a brokerage row is rendered
- **THEN** its checkbox is visually present but disabled
- **AND** clicking it does nothing

#### Scenario: Category badge is static for brokerage rows
- **WHEN** a brokerage row is rendered
- **THEN** the Category column shows `—` with no editing interaction
- **AND** clicking it does not open the category combobox

#### Scenario: Rule suggestions excluded for brokerage rows
- **WHEN** a brokerage transaction is displayed
- **THEN** the rule suggestion system does not evaluate or suggest rules for it

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

