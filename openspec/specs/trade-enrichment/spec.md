# trade-enrichment Specification

## Purpose
TBD - created by archiving change unify-fund-details-source. Update Purpose after archive.
## Requirements
### Requirement: Trade fund_detail records are enriched with execution data

Trade fund_detail records (classifiedType: TRADE) SHALL be enriched with quantity and price data from matched `filled_orders` records to preserve per-share execution detail in the unified view.

#### Scenario: Trade record matched to filled order by symbol and date
- **WHEN** a fund_detail record has `type: "Trade"`, `desc: "Buy-AVGO"`, and `businessDate: "2026-04-28"`
- **THEN** the adapter SHALL extract symbol `"AVGO"` from `desc`
- **THEN** the adapter SHALL extract action `BUY` from `desc` prefix
- **THEN** the adapter SHALL query filled orders for symbol `"AVGO"` with execution date `2026-04-28`
- **THEN** if a single match is found, the fund_detail record SHALL be enriched with `quantity`, `price`, and `commission` from the filled order

#### Scenario: Trade record with multiple matches uses most recent
- **WHEN** a fund_detail record matches multiple filled orders for the same symbol and date
- **THEN** the adapter SHALL select the filled order with the closest matching total amount (quantity * price ≈ fund_detail amount)
- **THEN** if no amount match, the adapter SHALL use the most recent filled order by execution time

#### Scenario: Trade record cannot be matched
- **WHEN** a fund_detail trade record has no matching filled order by symbol or date
- **THEN** the trade record SHALL still be included in the unified view as type `TRADE`
- **THEN** `quantity` and `price` SHALL be undefined
- **THEN** the description SHALL show the total amount without per-share detail
- **THEN** a debug log SHALL record the unmatched trade

#### Scenario: Enriched trade record appears in unified view
- **WHEN** a fund_detail trade record is enriched with `quantity: 10`, `price: 200.88`, `action: BUY`
- **THEN** the unified view SHALL display a row with type `BUY`
- **THEN** the row description SHALL include quantity and price per share
- **THEN** the row SHALL use a negative amount (cash outflow for BUY)
- **THEN** `symbol`, `quantity`, and `price` SHALL be available for display

### Requirement: Filled orders are NOT duplicated as separate transaction rows

When a trade fund_detail record is enriched from a filled order, the filled order SHALL NOT produce a separate row in the unified view to avoid double-counting.

#### Scenario: Filled order is excluded when fund_detail trade record exists
- **WHEN** the unified view merges brokerage data
- **THEN** filled orders that have been matched to a fund_detail trade record SHALL be excluded from the separate `mapBrokerageTransaction()` output
- **THEN** filled orders without a matching fund_detail record SHALL still appear as standalone BUY/SELL rows

#### Scenario: Fee line items complement trade row
- **WHEN** a trade has fund_detail fee records (Commission, Platform Fee, etc.) with the same symbol and date
- **THEN** each fee SHALL appear as a separate FEE row in the unified view
- **THEN** the total of fee rows plus trade amount SHALL equal the total cash impact of the trade

