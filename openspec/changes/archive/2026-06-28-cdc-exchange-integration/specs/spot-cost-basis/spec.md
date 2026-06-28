# Spec: spot-cost-basis

## ADDED Requirements

### Requirement: Weighted-average cost computation
The system SHALL provide a pure cost-basis engine that, given the chronologically ordered basis events for a token (trades, deposits, withdrawals, conversions), computes weighted-average cost state: BUY events MUST increase quantity and total cost by `price × quantity + fee`; SELL events MUST decrease quantity and decrease total cost proportionally (`removedCost = totalCost × soldQty / qty`), accumulating realized P&L as `proceeds − removedCost`. The engine MUST output `avgCost = totalCost / quantity`, realized P&L, and a basis-quality flag.

#### Scenario: Buys then partial sell
- **WHEN** events are BUY 1 BTC @ 20,000 then BUY 1 BTC @ 30,000 then SELL 1 BTC @ 40,000
- **THEN** avgCost is 25,000, realized P&L is 15,000, and remaining quantity is 1

#### Scenario: Fees included in basis
- **WHEN** a BUY of 1 token at 100 carries a 1 fee
- **THEN** total cost is 101 and avgCost is 101

### Requirement: Deposits valued at market price
Transferred-in quantities (on-chain deposits, App→Exchange transfers, staking rewards treated as acquisitions) SHALL enter the basis at the token's market price on the event date, obtained from the daily candlestick close, and the position's basis quality MUST be flagged `estimated`. Withdrawals SHALL reduce quantity and cost proportionally without affecting realized P&L. If the price lookup fails, the event MUST enter at zero cost and the basis quality MUST be flagged `incomplete`.

#### Scenario: Deposit priced from candlestick
- **WHEN** 2 ETH are deposited on a date whose daily close is 2,500
- **THEN** quantity increases by 2, total cost increases by 5,000, and basis quality is `estimated`

#### Scenario: Price lookup failure degrades gracefully
- **WHEN** no candlestick data exists for the deposit date
- **THEN** the deposit enters at zero cost and basis quality is `incomplete`

### Requirement: Reconciliation against authoritative balances
After computing basis from events, the engine SHALL compare the computed quantity to the authoritative quantity from `user-balance`. If they diverge beyond a relative tolerance of 0.1%, the engine MUST reconcile by inserting a synthetic adjustment event (priced at current market price if positive, proportional reduction if negative), flag basis quality `incomplete`, and emit a diagnostic describing the divergence.

#### Scenario: Missing history reconciled
- **WHEN** computed quantity is 0.8 BTC but the exchange reports 1.0 BTC
- **THEN** a synthetic acquisition of 0.2 BTC at current market price is applied, basis quality is `incomplete`, and a diagnostic explains the adjustment

#### Scenario: Dust within tolerance ignored
- **WHEN** computed and authoritative quantities differ by less than 0.1%
- **THEN** no adjustment event is created and basis quality is unaffected

### Requirement: Basis enrichment persisted with positions
The sync pipeline SHALL run the cost-basis engine for each synced CDC token after transactions and fund details are persisted, write `avgCost`, `unrealizedPnl`, and `unrealizedPnlPercent` onto the stored position, and persist basis quality and diagnostics via position extensions so the Holdings tab renders them like Tiger diagnostics.

#### Scenario: Holdings shows computed P&L
- **WHEN** a CDC position has trades covering its full quantity
- **THEN** the Holdings tab displays avgCost and unrealized P&L for it with no basis-quality diagnostic

#### Scenario: Estimated basis surfaced
- **WHEN** part of a position's basis came from a market-priced deposit
- **THEN** the Holdings detail row shows a diagnostic indicating the cost basis is estimated

#### Scenario: Recompute after deep sync
- **WHEN** a periodic deep sync backfills late-posted ledger records for a token
- **THEN** that token's basis is recomputed and the stored position values are updated
