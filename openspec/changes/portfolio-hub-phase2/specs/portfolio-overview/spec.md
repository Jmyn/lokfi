## ADDED Requirements

### Requirement: Overview tab displays portfolio KPIs
The system SHALL display three key metrics in the Overview tab: total portfolio value, day change, and dividends year-to-date.

#### Scenario: Portfolio has holdings and cash
- **WHEN** the Overview tab is active and brokerage data exists
- **THEN** the total portfolio value card shows the sum of all position market values plus cash balances
- **AND** the day change card shows the difference between current total and the previous sync total
- **AND** the dividends YTD card shows the sum of all DIVIDEND corp actions in the current calendar year
- **AND** each card shows a secondary line with the raw amount in the dominant underlying currency

#### Scenario: Portfolio is empty
- **WHEN** the Overview tab is active and no brokerage data exists
- **THEN** an empty state message is displayed: "No portfolio data yet. Sync your brokerage account to see your holdings."
- **AND** a link to `/settings/brokerage` is shown

### Requirement: Overview tab displays asset allocation
The system SHALL render an asset allocation section with a donut chart and legend.

#### Scenario: Holdings exist across multiple asset classes
- **WHEN** the Overview tab is active and positions exist
- **THEN** a donut chart shows the percentage breakdown by asset class
- **AND** a legend lists each asset class with a color swatch, percentage, and converted value
- **AND** hovering on a donut segment highlights the corresponding legend row

#### Scenario: Allocation breakdown
- **WHEN** positions are grouped by their `secType` field
- **THEN** the donut chart segments represent: STK (equities), OPT (options), CASH (cash), FUND (funds), and OTHER (everything else)
- **AND** percentages are calculated as `position market value / total portfolio value`

### Requirement: Overview tab displays currency breakdown
The system SHALL display a currency breakdown section with mini progress bars.

#### Scenario: Holdings exist in multiple currencies
- **WHEN** the Overview tab is active and positions have different currencies
- **THEN** each currency is displayed in a card with its total value and percentage of the portfolio
- **AND** a mini horizontal progress bar shows the percentage
- **AND** clicking a card expands to show holdings within that currency

### Requirement: Overview tab displays performance sparkline
The system SHALL render a performance sparkline showing portfolio value over time.

#### Scenario: Historical data exists
- **WHEN** the Overview tab is active and at least two sync snapshots exist
- **THEN** an area chart shows portfolio value over the selected time range
- **AND** a time range toggle allows switching between 1M, 3M, 6M, 1Y, YTD, and All

#### Scenario: Insufficient historical data
- **WHEN** fewer than two sync snapshots exist
- **THEN** the chart area shows "Not enough data — sync again to build history"
