# cost-basis-opening-cost Specification

## Purpose
TBD - created by archiving change cdc-cost-basis-tracking. Update Purpose after archive.
## Requirements
### Requirement: Stable opening-position estimate
The system SHALL price the unexplained opening remainder of a CDC holding (authoritative quantity minus the quantity explained by synced trades/transfers) at the market price on the holding's **earliest local activity date**, computed deterministically so repeated syncs with unchanged data yield an identical cost basis. It SHALL NOT re-price the remainder at current market.

Basis quality for the remainder SHALL be determined by the price actually used: a non-null opening price (estimate or override) on a positive remainder yields `estimated` (or `manual` when the price came from an override — see the override requirement); a null opening price (no market price available) yields `incomplete`. When the reconciliation only removes excess quantity (no new units are priced), the basis quality SHALL be left as the engine already computed it rather than forced to `incomplete`.

#### Scenario: Basis does not drift across syncs
- **WHEN** a holding's basis is computed, the market price then changes, and enrichment runs again with no new trades
- **THEN** the reported avgCost is unchanged

#### Scenario: Opening remainder priced at earliest activity
- **WHEN** a holding has synced trades plus an unexplained opening remainder and a market price is available for the earliest activity date
- **THEN** the remainder is valued at that price and the holding's quality is `estimated`

#### Scenario: No price available yields incomplete
- **WHEN** a holding has an opening remainder but no market price can be resolved for the anchor date
- **THEN** the remainder enters at zero cost and the holding's quality is `incomplete`

#### Scenario: Excess-removal does not force incomplete
- **WHEN** reconciliation only strips excess quantity to match the authoritative balance (no new units priced)
- **THEN** the basis quality is whatever the engine computed from the priced lots, not forced to `incomplete`

#### Scenario: No remainder, no estimate
- **WHEN** synced trades fully explain a holding's quantity (within dust tolerance)
- **THEN** there is no opening remainder to price and the basis quality is not `estimated`

### Requirement: Opening cost blends with synced trades
The opening remainder SHALL be combined with synced trades into a single quantity-weighted average cost that reconciles to the authoritative balance. The opening remainder contributes its quantity at the opening price; synced trades contribute at their actual prices.

#### Scenario: Blended average
- **WHEN** the opening remainder is 0.80 units at $42,000 and a synced trade is 0.20 units at $61,000
- **THEN** the reported avgCost is the quantity-weighted blend ($45,800/unit) over a total quantity of 1.00

### Requirement: Manual opening cost override
The system SHALL allow the user to set a **per-unit** opening cost for a holding, identified by its security identity. When set, this value SHALL be used as the opening remainder's price in place of the estimate, blending with synced trades exactly as the estimate would, and the holding's basis quality SHALL be `manual`. The override SHALL persist across syncs, full resyncs, disconnect/reconnect, **and backup export/restore**. Clearing it SHALL revert the holding to the estimate.

#### Scenario: Override survives backup export and restore
- **WHEN** the user has set an opening cost, exports a backup, and later restores it
- **THEN** the override is present after restore and is applied to the holding's basis

#### Scenario: Override replaces the estimate and blends
- **WHEN** the user sets an opening cost of $42,000/unit on a holding that also has synced trades
- **THEN** the opening remainder is priced at $42,000, blended with the synced trades, and the holding's quality is `manual`

#### Scenario: Override is per-unit and survives quantity changes
- **WHEN** an override is set and later syncing captures more history, shrinking the opening remainder
- **THEN** the per-unit override still applies to the (smaller) remaining opening quantity without re-entry

#### Scenario: Override survives a full resync
- **WHEN** the user has set an opening cost and then performs a full resync that clears and re-syncs CDC data
- **THEN** the override is still applied afterward

#### Scenario: Clearing reverts to estimate
- **WHEN** the user clears a previously set opening cost
- **THEN** the holding reverts to the earliest-activity estimate and quality `estimated`

#### Scenario: Override inert when fully tracked
- **WHEN** a holding has no opening remainder and the user has set an override
- **THEN** the override has no effect on the reported avgCost

### Requirement: Holdings opening-cost field and quality badge
The Holdings expanded row SHALL provide an "Initial cost per unit" field for CDC holdings that have an opening remainder, showing the opening quantity the value applies to, and SHALL recompute and persist the holding's basis on save. The existing free-text `estimated` diagnostic (which attributes the estimate specifically to "deposits/rewards") SHALL be removed, as it is misleading once `estimated` also covers an anchored opening remainder; basis quality SHALL instead be conveyed by neutral badges — `Estimated` for an estimate-priced remainder, `Manual` for an override. The `incomplete` diagnostic MAY remain as free text.

#### Scenario: Set opening cost from Holdings
- **WHEN** the user enters an initial cost per unit and saves
- **THEN** the override is stored, the holding's basis is recomputed, and Holdings/Overview update to the blended avgCost with a `Manual` badge

#### Scenario: Field reflects the priced quantity
- **WHEN** the editor is shown for a holding with an opening remainder
- **THEN** the opening quantity the per-unit cost will price is displayed alongside the field

#### Scenario: Field hidden when fully tracked
- **WHEN** a holding has no opening remainder
- **THEN** the field is hidden or shown as "fully tracked from trade history"

