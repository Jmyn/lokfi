## ADDED Requirements

### Requirement: Dividends tab displays YTD summary metrics
The system SHALL display summary metrics for dividend income in the Dividends tab.

#### Scenario: Dividends exist for the current year
- **WHEN** the Dividends tab is active and dividend corp actions exist
- **THEN** the YTD Total card shows the sum of all dividend amounts in the current calendar year
- **AND** the Monthly Average card shows `YTD Total / number of months with dividends`
- **AND** the Yield on Cost card shows `annualized dividends / total cost basis` as a percentage
- **AND** all values are converted to the preferred currency using cached FX rates

#### Scenario: No dividends exist
- **WHEN** the Dividends tab is active and no dividend corp actions exist
- **THEN** an empty state message is displayed: "No dividends recorded yet."

### Requirement: Dividends tab displays monthly bar chart
The system SHALL render a bar chart showing dividend income by month.

#### Scenario: Monthly dividend data exists
- **WHEN** dividend corp actions exist with `payDate` or `exDate`
- **THEN** a bar chart groups dividends by month (Jan–Dec)
- **AND** each bar height represents the total dividend amount for that month
- **AND** the chart updates when the year selector changes

#### Scenario: Year selector
- **WHEN** a user selects a different year from the dropdown
- **THEN** the chart and summary metrics update to reflect that year's dividends

### Requirement: Dividends tab displays dividend history table
The system SHALL display a table of individual dividend records.

#### Scenario: Dividend records exist
- **WHEN** the Dividends tab is active
- **THEN** a table shows: Symbol, Ex-Date, Pay Date, Amount, Currency, and Type
- **AND** rows are sorted by pay date descending
- **AND** a filter allows showing All, Paid (past pay date), or Estimated (future pay date)

### Requirement: Dividend income integration with transactions
The system SHALL provide a link from dividends to the unified transaction view.

#### Scenario: User clicks a dividend row
- **WHEN** a user clicks on a dividend row in the Dividends tab
- **THEN** the app navigates to `/transactions` with the Brokerage tab active and the symbol filtered
