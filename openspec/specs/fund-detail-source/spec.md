# fund-detail-source Specification

## Purpose
TBD - created by archiving change unify-fund-details-source. Update Purpose after archive.
## Requirements
### Requirement: Provider fetches all fund_detail types

The Tiger provider SHALL call the `fund_details` API with `fund_type: 'ALL'` instead of `'CORPORATE_ACTION'`, returning records for all 13 fund_detail types: Trade, Commission, Platform Fee, Settlement Fee, GST, Trading Activity Fee, SEC Fee, Option Regulatory Fee, Clearing Fee, Dividend, Dividend Tax, Funds Transfer In, and Campaign Subsidy.

#### Scenario: Fetch ALL fund details within date range
- **WHEN** the provider's `fetchFundDetails(since)` is called with a 90-day lookback
- **THEN** the API request includes `fund_type: 'ALL'`, `seg_types: ['SEC']`, `start_date`, and `end_date`
- **THEN** the response is parsed into `TigerFundDetail[]` records
- **THEN** records of all 13 types are present in the result (assuming account activity)

#### Scenario: Paginate when result set exceeds page size
- **WHEN** the provider fetches `fund_details` with `limit: 100` and the response contains exactly 100 records
- **THEN** the provider SHALL issue a subsequent request with `page: 2`
- **THEN** the provider SHALL continue fetching pages until a response contains fewer than 100 records
- **THEN** all pages SHALL be merged into a single result array before adaptation
- **THEN** a 600ms delay SHALL be applied between consecutive page requests to respect rate limits

#### Scenario: Single page when result set fits
- **WHEN** the response contains fewer than 100 records on the first page
- **THEN** the provider SHALL NOT issue additional page requests
- **THEN** the result SHALL be adapted directly

#### Scenario: Handle unknown fund_detail types gracefully
- **WHEN** Tiger returns a fund_detail record with a `type` field not in the known mapping table
- **THEN** the record SHALL be classified as `FEE` with the raw type preserved
- **THEN** a warning SHALL be logged with the unknown type name
- **THEN** the record SHALL still appear in the unified transaction view

### Requirement: Fund details are adapted to normalized type

Each raw `TigerFundDetail` record SHALL be adapted into a `BrokerageFundDetail` with a classified type, extracted symbol, and preserved raw type for display purposes.

#### Scenario: Dividend record classification
- **WHEN** a fund_detail record has `type: "Dividend"` and `desc: "XDTE-DIVIDEND"`
- **THEN** `classifiedType` SHALL be `DIVIDEND`
- **THEN** `symbol` SHALL be extracted as `"XDTE"` from the description
- **THEN** `amount` SHALL be positive (cash inflow)

#### Scenario: Dividend Tax withheld (outflow) classification
- **WHEN** a fund_detail record has `type: "Dividend Tax"`, `desc: "XDTE-DIVIDEND"`, and negative amount
- **THEN** `classifiedType` SHALL be `DIVIDEND_TAX`
- **THEN** `symbol` SHALL be extracted as `"XDTE"` from the description
- **THEN** the record SHALL be displayed as tax withheld

#### Scenario: Dividend Tax refund (return of capital) classification
- **WHEN** a fund_detail record has `type: "Dividend Tax"`, `desc: "XDTE-DIVIDEND"`, and positive amount
- **THEN** `classifiedType` SHALL be `DIVIDEND_TAX`
- **THEN** `symbol` SHALL be extracted as `"XDTE"` from the description
- **THEN** the record SHALL be displayed as a tax refund (return of capital)

#### Scenario: Fee record classification
- **WHEN** a fund_detail record has `type: "Commission"` (or "Platform Fee", "Settlement Fee", etc.)
- **THEN** `classifiedType` SHALL be `FEE`
- **THEN** `rawType` SHALL preserve the original type string for display
- **THEN** `symbol` SHALL be extracted from `desc` (e.g., "Buy-AVGO" → "AVGO")

#### Scenario: Transfer record classification
- **WHEN** a fund_detail record has `type: "Funds Transfer In"`
- **THEN** `classifiedType` SHALL be `TRANSFER_IN`
- **THEN** `amount` SHALL be positive (cash inflow)

#### Scenario: Rebate record classification
- **WHEN** a fund_detail record has `type: "Campaign Subsidy"`
- **THEN** `classifiedType` SHALL be `REBATE`
- **THEN** `amount` SHALL be positive (cash inflow)

### Requirement: Fund details are persisted in a dedicated Dexie table

All adapted `BrokerageFundDetail` records SHALL be stored in a new `brokerageFundDetails` Dexie table with natural key deduplication.

#### Scenario: Append fund details without overwriting
- **WHEN** the sync orchestrator calls `appendFundDetails()` with a batch of records
- **THEN** records SHALL be persisted to `brokerageFundDetails` using `bulkPut`
- **THEN** records with the same `id` SHALL be overwritten (last write wins)
- **THEN** new records with unique `id` SHALL be inserted without affecting existing records

### Requirement: Fund details appear in unified transaction view

Fund_detail records SHALL be merged into the unified transaction view alongside bank transactions and filled order records.

#### Scenario: Dividend appears as DIVIDEND row
- **WHEN** a fund_detail record has `classifiedType: DIVIDEND` with amount $94.15
- **THEN** the unified view SHALL display a row with type `DIVIDEND`
- **THEN** the row description SHALL include the symbol and amount
- **THEN** the row SHALL be sortable by date

#### Scenario: Fee appears as FEE row with raw type in description
- **WHEN** a fund_detail record has `classifiedType: FEE` and `rawType: "Platform Fee"`
- **THEN** the unified view SHALL display a row with type `FEE`
- **THEN** the row description SHALL mention "Platform Fee" and the amount
- **THEN** the row SHALL use a negative amount (cash outflow)

#### Scenario: Dividend Tax withheld displayed as DIVIDEND_TAX row
- **WHEN** a fund_detail record has `classifiedType: DIVIDEND_TAX` with amount -$28.24
- **THEN** the unified view SHALL display a row with type `DIVIDEND_TAX`
- **THEN** the description SHALL indicate "Dividend Tax withheld"
- **THEN** the row SHALL appear adjacent to its corresponding dividend row (same symbol and date)

#### Scenario: Dividend Tax refund displayed as DIVIDEND_TAX row
- **WHEN** a fund_detail record has `classifiedType: DIVIDEND_TAX` with positive amount
- **THEN** the unified view SHALL display a row with type `DIVIDEND_TAX`
- **THEN** the description SHALL indicate "Dividend Tax refund (return of capital)"
- **THEN** the row SHALL appear adjacent to its corresponding dividend row (same symbol and date)

#### Scenario: Transfer appears as TRANSFER_IN row
- **WHEN** a fund_detail record has `classifiedType: TRANSFER_IN` with amount $20.29
- **THEN** the unified view SHALL display a row with type `TRANSFER_IN`
- **THEN** the row SHALL use a positive amount (cash inflow)

### Requirement: Fund details are included in profile export and import

The `brokerageFundDetails` table SHALL be included in the profile backup JSON (version 3) and restored during import alongside other brokerage tables.

#### Scenario: Export includes fund details
- **WHEN** the user exports a profile backup
- **THEN** the backup JSON SHALL include a `brokerageFundDetails` array with all fund detail records
- **THEN** the backup `version` SHALL be `3`

#### Scenario: Import v3 backup restores fund details
- **WHEN** the user imports a v3 backup containing `brokerageFundDetails`
- **THEN** the `brokerageFundDetails` table SHALL be cleared and repopulated from the backup
- **THEN** fund detail records SHALL be restored with their original `id`, `classifiedType`, `amount`, and `businessDate`

#### Scenario: Import v2 backup without fund details is accepted
- **WHEN** the user imports a v2 backup that does not contain `brokerageFundDetails`
- **THEN** the import SHALL succeed without errors
- **THEN** other brokerage tables SHALL be restored normally
- **THEN** fund detail records SHALL be absent (repopulated on next sync)

#### Scenario: Import v3 backup without fund details is rejected
- **WHEN** the user imports a v3 backup missing the `brokerageFundDetails` array
- **THEN** the import SHALL be rejected with a validation error message indicating missing brokerage data

