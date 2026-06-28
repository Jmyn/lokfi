## ADDED Requirements

### Requirement: FX rates are fetched and cached daily
The system SHALL fetch foreign exchange rates from the Frankfurter API and cache them in Dexie.

#### Scenario: First visit to Portfolio page
- **WHEN** a user navigates to `/portfolio` and no cached rates exist for today
- **THEN** the system fetches rates from `https://api.frankfurter.dev/v2/latest?from=USD`
- **AND** stores the result in `db.fxRates` as `{ date, base, rates }`
- **AND** displays a "Last updated: today" micro-text

#### Scenario: Rates already cached for today
- **WHEN** a user navigates to `/portfolio` and cached rates exist for today
- **THEN** the system uses the cached rates without making an API call
- **AND** displays the cached date in the micro-text

#### Scenario: Frankfurter API fails
- **WHEN** the Frankfurter request fails
- **THEN** the system attempts the fallback endpoint `https://open.er-api.com/v6/latest/USD`
- **AND** if both fail, uses the most recent cached rates regardless of date
- **AND** shows a warning: "Using cached rates from {date}"

#### Scenario: No cached rates and both APIs fail
- **WHEN** no cached rates exist and both APIs fail
- **THEN** amounts are shown in their original currency without conversion
- **AND** a warning is shown: "FX rates unavailable. Showing original currencies."

### Requirement: Currency conversion utility
The system SHALL provide a utility function to convert amounts between currencies using cached rates.

#### Scenario: Convert USD to SGD
- **WHEN** converting $100 USD to SGD with cached rate `SGD: 1.35`
- **THEN** the result is `100 * 1.35 = 135 SGD`

#### Scenario: Convert between non-USD currencies
- **WHEN** converting SGD to HKD with cached rates `SGD: 1.35, HKD: 7.82`
- **THEN** the result is `amount * (7.82 / 1.35)`

#### Scenario: Convert to same currency
- **WHEN** converting SGD to SGD
- **THEN** the result is the original amount with no API call

### Requirement: Currency selector affects all monetary values
The system SHALL provide a currency selector in the Portfolio header that converts all displayed amounts.

#### Scenario: User selects USD
- **WHEN** a user selects USD from the currency dropdown
- **THEN** all monetary values on the Portfolio page are converted to USD
- **AND** the preference is stored in `db.settings` with key `portfolio:preferredCurrency`
- **AND** the selection persists across page refreshes

#### Scenario: Default currency
- **WHEN** a user visits `/portfolio` for the first time
- **THEN** the default currency is SGD
- **AND** the selector shows "SGD"
