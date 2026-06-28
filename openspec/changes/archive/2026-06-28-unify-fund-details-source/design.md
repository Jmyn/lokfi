## Context

The current pipeline has two separate Tiger API calls that partially overlap:

```
filled_orders ──→ adaptOrder() ──→ db.brokerageTransactions ──→ mapBrokerageTransaction()
fund_details(CORP_ACTION) ──→ adaptCorpAction() ──→ db.brokerageCorpActions ──→ mapCorpAction()
```

The `fund_details` endpoint with `fund_type: 'ALL'` returns the brokerage's complete cash ledger — 13 distinct transaction types including trades, fees, dividends, dividend tax, transfers, and rebates. Currently only 3 of 13 types are captured (Dividend, Commission via filled_orders, and Trade via filled_orders). Another 10 types are silently lost.

Additionally, `order_transactions` per-order detail is already fetched in `fetchTransactions()` (line 80-91 of `tiger-provider.ts`) but the results are discarded — the data is there, just unused.

**Constraints:**
- Tiger `fund_details ALL` provides cash amounts but NOT quantity/price data for trades
- `filled_orders` provides quantity/price but NOT per-trade fee breakdown
- `order_transactions` provides per-fill execution detail with quantity/price (already being fetched)
- Must maintain Dexie as the persistence layer
- Must not break the unified transactions view or its React hook

## Goals / Non-Goals

**Goals:**
- Capture all 13 fund_detail types in a single pipeline
- Preserve per-share execution detail (quantity, price) on trade records via enrichment
- Replace the limited `CORPORATE_ACTION` pipeline entirely
- Classify each fund_detail record into a meaningful unified view row type
- Keep `filled_orders` for trade enrichment only, not as a separate transaction source

**Non-Goals:**
- Changing how bank transactions are handled
- Adding position-level dividend tracking (dividend yield, DRIP tracking)
- Real-time push subscriptions for fund details
- Changing the unified view UI/UX beyond new row types
- Supporting other brokerages beyond the provider interface contract change

## Decisions

### 1. New `BrokerageFundDetail` type over expanding `BrokerageCorpAction`

**Decision:** Create `BrokerageFundDetail` as a new normalized type.

**Why:** Fund_detail records are cash movements, not corporate actions. A "Commission Fee" or "Funds Transfer In" is fundamentally different from a dividend or stock split. Putting them in the same type loses semantic clarity and forces nullable fields. The `amount` sign convention differs: corp actions are positive events, fund_details are cash inflows (+)/outflows (-).

**Alternative considered:** Expand `BrokerageCorpAction` to include optional fields for fee/transfer types. Rejected because it conflates two distinct concepts and would require nullable `symbol`, optional `amount` sign semantics, and confusing union types.

**New type shape:**
```typescript
export type FundDetailType = 'DIVIDEND' | 'DIVIDEND_TAX' | 'TRADE' | 'FEE' | 'TRANSFER_IN' | 'REBATE' | 'CORP_ACTION'

export interface BrokerageFundDetail {
  id: string
  source: BrokerageSource
  /** Raw type string from the brokerage (e.g. "Commission", "Platform Fee") */
  rawType: string
  /** Classified type for the unified view */
  classifiedType: FundDetailType
  symbol?: string           // extracted from desc for trades/dividends
  contractName?: string     // display name (e.g. "Broadcom")
  amount: number
  currency: string
  /** Trade action (BUY/SELL) — only present when classifiedType is TRADE */
  action?: TradeAction
  /** Enriched from filled_orders — only present for TRADE records */
  quantity?: number
  price?: number
  commission?: number
  businessDate: string
  segType?: string
}
```

### 2. Type classification strategy

**Decision:** Classify based on the `type` field from the `ALL` response using a static mapping table.

```
Tiger type              → FundDetailType
─────────────────────────────────────────
Dividend                → DIVIDEND
Dividend Tax            → DIVIDEND_TAX
Trade                   → TRADE
Commission              → FEE
Platform Fee            → FEE
Settlement Fee          → FEE
GST                     → FEE
Trading Activity Fee    → FEE
SEC Fee                 → FEE
Option Regulatory Fee   → FEE
Clearing Fee            → FEE
Funds Transfer In       → TRANSFER_IN
Campaign Subsidy        → REBATE
```

For unknown types: classify as `FEE` with a warning log.

**Why mapping table over regex/pattern matching:** The type field is a reliable, structured value from Tiger. Pattern matching on descriptions is fragile (e.g., "Dividend" appears in both "Dividend" and "Dividend Tax" types, but the `type` field distinguishes them).

### 3. Trade enrichment from filled_orders

**Decision:** Trade fund_detail records are enriched with quantity/price from `filled_orders` by matching the fund_detail `desc` (e.g., "Buy-AVGO") to order records by symbol and date proximity.

**Matching strategy (from most to least reliable):**
1. Extract symbol from `desc` (first word: "Buy-AVGO" → "AVGO"), match to filled order by symbol and same-day execution
2. Extract action from `desc` prefix ("Buy" = BUY, "Sell" = SELL), match to filled order by symbol + action + date
3. If `order_transactions` per-order detail is available (already fetched), use it for exact fill-level price/quantity

**Why not drop filled_orders entirely:** `fund_details` only gives total cash settlement amount. Without quantity/price, the unified view loses per-share detail ("100 shares @ $20.08") in favor of just a lump sum ("-$2008.80"). Users need both.

### 4. Sync category: new `fund_details` vs modifying `corp_actions`

**Decision:** Rename the sync category from `corp_actions` to `fund_details` in the orchestrator.

**Why:** The category name should reflect what's actually being synced. `corp_actions` is misleading when the pipeline includes fees, transfers, and rebates. This is a semantic rename — the rate limit tier stays the same (Medium, 1100ms).

### 5. Database table: new `brokerageFundDetails`

**Decision:** Add a new `brokerageFundDetails` table at schema v7. Keep `brokerageCorpActions` at v5 but stop writing to it.

**Why:** Dexie migrations can't rename tables. Adding a new table alongside the old one is safer and allows existing corp action data to be migrated or left as history. The old table can be dropped in a future cleanup migration.

**v7 schema addition:**
```typescript
brokerageFundDetails: 'id, source, classifiedType, symbol, businessDate'
```

### 6. Provider interface change

**Decision:** Remove `fetchCorpActions()` from `BrokerageProvider` entirely. Add `fetchFundDetails(since): Promise<BrokerageFundDetail[]>` as a required method.

**Why:** We are in early development — no production users to break. Carrying deprecated methods adds maintenance debt with zero benefit. The CDC stub is trivially updated (return `[]`). The `fetchCorpActions()` semantic was always wrong for this data; `fetchFundDetails()` accurately describes what the method does.

### 7. Unified view row types

**Decision:** Extend `BrokerageRowType` with new types: `'DIVIDEND_TAX'`, `'TRANSFER_IN'`, `'REBATE'`. Keep existing `'FEE'` for all fee subtypes.

**Why:** `DIVIDEND_TAX` is a distinct cash event users care about (tax withheld on dividends). `TRANSFER_IN` is a deposit event. `REBATE` is a fee rebate. These are semantically different from generic fees and users may want to filter on them. Individual fee types (Commission, SEC Fee, etc.) all map to `FEE` to avoid row-type explosion — the `rawType` field preserves the specific fee name for display.

### 8. Dividend tax refund handling

**Decision:** `DIVIDEND_TAX` rows use the sign of the amount to determine display semantics: negative = tax withheld (outflow), positive = tax refund (inflow, typically return of capital adjustment by Tiger).

**Why:** Tiger occasionally issues "Dividend Tax" records with positive amounts as return-of-capital refunds. Treating all Dividend Tax records as outflows would incorrectly display refunds. The `amount` sign is the authoritative signal — negative means money left the account, positive means money entered.

**Display convention:**
- Negative amount → description reads "Dividend Tax withheld"
- Positive amount → description reads "Dividend Tax refund (return of capital)"

### 9. Pagination for fund_details ALL

**Decision:** Implement cursor-based pagination for `fund_details ALL` using a `page` parameter. The provider fetches pages sequentially until no more data is returned, then merges all pages into a single result array.

**Why:** The sample data shows ~90 fund_detail records over ~1 month of active trading. A 90-day lookback could easily exceed 100 records (the default page size). Without pagination, older records would be silently dropped. The Tiger `fund_details` API supports a `page` parameter (and returns an empty array when exhausted).

**Pagination strategy:**
1. Start with `page: 1`, `limit: 100`
2. If response has 100 records, fetch `page: 2`, etc.
3. Stop when response has fewer than 100 records (last page)
4. Merge all pages before adapting
5. Apply the single rate-limit delay between pages (600ms) to avoid triggering rate limits with sequential requests

### 10. Profile export/import integration

**Decision:** `brokerageFundDetails` SHALL be included in the profile backup/restore pipeline alongside other brokerage tables. The backup format version bumps from 2 to 3.

**Why:** Users who export a backup and later restore it must not lose their fund_detail data (dividends, fees, transfers). Without this, restoring a backup would silently drop all fund_detail records, requiring a full re-sync.

**Backward compatibility:**
- Export: always writes version `3`
- Import: accepts v1, v2, **and** v3 backups
- v2 imports: `brokerageFundDetails` is optional (old backups won't have it — records repopulate on next sync)
- v3 imports: `brokerageFundDetails` is required in validation

**Confirmation dialog:** The import summary lists fund_detail count alongside other brokerage records.

## Risks / Trade-offs

**[Risk] Trade matching is probabilistic** — matching fund_detail trade records to filled_orders by symbol + date is not perfectly deterministic. A symbol traded twice on the same day could match incorrectly.
→ **Mitigation:** Use `order_transactions` per-order detail data (already fetched) for exact fill-level matching. Fall back to simple symbol/date match only when `order_transactions` is unavailable. Log unmatched trade records so users can see them.

**[Risk] `fund_details ALL` returns a different response shape than `CORPORATE_ACTION`** — the `type` field is present in `ALL` but may not be in `CORPORATE_ACTION`. This is confirmed from the sample data.
→ **Mitigation:** The new `TigerFundDetail` type includes `type` as an optional field (it exists in ALL but may not in other fund_type values). The adapter handles missing `type` by falling back to `'UNKNOWN'`.

**[Risk] Breaking change to `BrokerageProvider` interface** — `fetchCorpActions()` is removed.
→ **Mitigation:** Early dev phase — no production users. CDC stub gets `fetchFundDetails() { return [] }` alongside the other methods. Single straightforward update for any future provider implementations.

**[Risk] Deduplication across sync cycles** — fund_details with ALL may return the same records across multiple sync windows.
→ **Mitigation:** The `brokerageFundDetails` table uses `id` (based on Tiger record ID) as the primary key. `bulkPut` in Dexie naturally deduplicates by key. Same strategy already used for `brokerageCorpActions`.

**[Risk] API rate limits** — paginated `fund_details ALL` fetches multiple pages sequentially, each counting against the medium-tier rate limit (60 req/min).
→ **Mitigation:** Apply 600ms delay between paginated pages. Typical usage: 2-3 pages per sync cycle (180-270 records over 90 days). Medium tier allows 60 req/min — well within limits. Monitor and adjust page delay if needed.

## Migration Plan

1. Add `BrokerageFundDetail` type to `@lokfi/brokerage-core`
2. Replace `fetchCorpActions()` with `fetchFundDetails()` in `BrokerageProvider` interface (breaking)
3. Add `TigerFundDetail` type to `tiger-types.ts`
4. Add v7 schema with `brokerageFundDetails` table to `db.ts`
5. Implement paginated `fetchFundDetails()` in `TigerProvider`
6. Implement `adaptFundDetail()` in `tiger-adapter.ts`
7. Implement trade enrichment logic (fund_detail + filled_orders merge)
8. Add `appendFundDetails()` to `SyncDatabase` interface and `DexieSyncAdapter`
9. Update `SyncOrchestrator` to sync `fund_details` category (replacing `corp_actions`)
10. Update `unifiedTransactions.ts` with `mapFundDetail()` and new row types
11. Update CDC stub — add `fetchFundDetails()` returning `[]`
12. Update `ProfilePage.tsx` — add `brokerageFundDetails` to export dump, import validation (v3), import confirmation dialog, and restore logic
13. Update tests for all changed modules
14. Update README documentation for the Tiger provider

**Rollback:** The old `brokerageCorpActions` table remains in place (unwritten after migration). Rolling back means reverting the unified view to query `brokerageCorpActions` instead of `brokerageFundDetails`. No data loss for existing records.

## Open Questions

- _Resolved: `fetchCorpActions()` removed entirely — early dev, no production users._
- _Resolved: Separate rows for dividend and dividend tax. Dividend Tax with positive amount displayed as "refund (return of capital)"._
- _Resolved: Pagination with `page` parameter, sequential fetches with 600ms inter-page delay._
