## ADDED Requirements

### Requirement: Signals tab displays the 9 Sig Lite indicator
The system SHALL display a Signals tab in `/investments` that shows TQQQ's 91-day growth, the 9% Kelly target, the delta, and a directional signal.

#### Scenario: Tab opens with valid Tiger credentials
- **WHEN** the user navigates to `/investments?tab=signals` and Tiger credentials are configured
- **THEN** the tab fetches TQQQ's 91-day K-line from Tiger; the latest bar's close is used as current price
- **AND** displays four KPI cards: 91-day growth, 9% target (always +9.0%), delta (growth − target), and days analyzed
- **AND** displays a signal badge: "Above 9 Sig pace" (green) when growth > target + tolerance, "Below 9 Sig pace" (red) when growth < target − tolerance, "On 9 Sig pace" (neutral) otherwise

#### Scenario: Tab opens without Tiger credentials
- **WHEN** the user navigates to `/investments?tab=signals` and no Tiger credentials exist
- **THEN** the tab displays an empty state with the message "Connect your Tiger account to see the 9 Sig signal"
- **AND** a button links to `/settings/brokerage`

#### Scenario: Tiger API returns an error
- **WHEN** the K-line call fails
- **THEN** the tab displays an error state with a "Retry" button
- **AND** the tab does not crash or show a broken layout

### Requirement: Signals tab shows a 91-day TQQQ price chart
The system SHALL render a line chart of TQQQ's daily closing price over the last 91 days with a horizontal reference line indicating the 9% target price.

#### Scenario: Chart renders with valid data
- **WHEN** the K-line data is available
- **THEN** a Recharts LineChart shows TQQQ closing prices by date
- **AND** a horizontal ReferenceLine at the price `price91dAgo × 1.09` represents the 9% target
- **AND** the chart uses the existing `chartTheme` (TOOLTIP_STYLE, AXIS_TICK, LEGEND_STYLE)

### Requirement: Signals tab supports manual refresh
The system SHALL provide a manual refresh control and display the last-updated timestamp.

#### Scenario: User clicks Refresh
- **WHEN** the user clicks the Refresh button
- **THEN** the hook bypasses the in-memory cache and re-fetches K-line from Tiger
- **AND** the "Last updated" timestamp updates to the new fetch time

#### Scenario: Last updated display
- **WHEN** data has been fetched successfully
- **THEN** the tab displays "Last updated: X minutes ago" (or "just now" if <1 minute)

### Requirement: 9 Sig Lite calculation is correct
The system SHALL compute the signal state from current and reference prices using a pure function with deterministic, testable behavior.

#### Scenario: Growth above target
- **WHEN** current price is more than 0.5 percentage points above the target
- **THEN** the signal is "above"

#### Scenario: Growth below target
- **WHEN** current price is more than 0.5 percentage points below the target
- **THEN** the signal is "below"

#### Scenario: Growth within tolerance
- **WHEN** current price is within ±0.5 percentage points of the target
- **THEN** the signal is "on_track"

#### Scenario: Less than 91 days of K-line data available
- **WHEN** Tiger returns fewer than `lookbackDays` bars (e.g. newly listed instrument)
- **THEN** `price91dAgo` is the `close` of the earliest available bar
- **AND** `daysAnalyzed` reflects the actual number of days between that bar and the latest bar (not fixed to 91)
- **AND** the signal computation still runs against whatever data is available

### Requirement: Signals tab works with any provider that supports historical bars
The Signals tab SHALL resolve the data source from the user's configured providers in a deterministic order, and SHALL work the same way regardless of which provider is chosen.

#### Scenario: User has Tiger configured
- **WHEN** the user has Tiger credentials and the Signals tab opens
- **THEN** the resolver picks Tiger as the signal source
- **AND** the tab footer shows "Signal source: Tiger"

#### Scenario: User has multiple providers configured
- **WHEN** the user has more than one configured provider
- **THEN** the resolver picks the first one in deterministic order (Tiger first, then alphabetical by source)
- **AND** the tab footer shows the chosen source and the total count, e.g. "Signal source: Tiger (you have 2 connected brokers)"

#### Scenario: Primary provider fails and another is available
- **WHEN** the resolved provider's K-line call fails
- **THEN** the hook logs the error and tries the next provider in the chain
- **AND** the tab only shows an error state if every configured provider fails

#### Scenario: No provider supports historical bars
- **WHEN** the user has only providers that do not implement `fetchHistoricalBars` (e.g. CDC stub)
- **THEN** the resolver returns `null`
- **AND** the tab shows the empty state with a link to `/settings/brokerage`

### Requirement: In-memory cache reduces redundant Tiger calls
The system SHALL cache the most recent successful K-line result per symbol for 5 minutes.

#### Scenario: Tab re-opens within 5 minutes
- **WHEN** the user navigates away and back to the Signals tab within 5 minutes
- **THEN** the tab renders immediately from the cache without calling Tiger
- **AND** the "Last updated" timestamp reflects the original fetch time

#### Scenario: Tab re-opens after 5 minutes
- **WHEN** the user navigates away and back to the Signals tab after more than 5 minutes
- **THEN** the hook fires a fresh K-line call and updates the cache

### Requirement: BrokerageProvider exposes K-line method
The `BrokerageProvider` interface SHALL expose `fetchHistoricalBars`, with Tiger as the v1 implementation.

#### Scenario: Tiger provider implements the method
- **WHEN** `TigerProvider.fetchHistoricalBars('TQQQ', 'day', 100)` is called with valid credentials
- **THEN** it returns daily K-line bars for TQQQ (filtered to the most recent `lookbackDays` bars client-side)
- **AND** the latest bar's `close` is used as the current price

#### Scenario: Other providers throw Not Implemented
- **WHEN** a provider that does not implement `fetchHistoricalBars` is called
- **THEN** it throws a clear "Not Implemented" error
- **AND** the Signals tab handles the error gracefully
