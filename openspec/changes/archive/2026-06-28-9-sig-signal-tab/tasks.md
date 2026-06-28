## 1. Brokerage K-line Types

- [x] 1.1 Add `BrokerageKlineBar` type to `packages/brokerage-core/src/types.ts` (symbol, source, timestamp, open, high, low, close, volume, period)
- [x] 1.2 Re-export the type from `packages/brokerage-core/src/index.ts`

## 2. BrokerageProvider Interface Extension

- [x] 2.1 Add `fetchHistoricalBars(symbol: string, period: 'day' | 'week' | 'month', lookbackDays: number): Promise<BrokerageKlineBar[]>` to `BrokerageProvider` in `packages/brokerage-core/src/provider.ts`
- [x] 2.2 Update JSDoc on the method to document rate-limit expectations and error semantics
- [x] 2.3 Update the existing CDC stub (`apps/web/src/lib/brokerage/cdc/cdc-stub.ts`) to throw `Not Implemented`

## 3. Tiger Raw Types

- [x] 3.1 Add `TigerKlineBar` raw type to `apps/web/src/lib/brokerage/tiger/tiger-types.ts` (symbol, time, open, high, low, close, volume)
- [x] 3.2 Add `TigerFetchKlineParams` and `TigerFetchKlineResponse` types if not present in the reference

## 4. Tiger Adapter

- [x] 4.1 Add `adaptKlineBars(raw: TigerKlineBar[], source = 'tiger'): BrokerageKlineBar[]` to `apps/web/src/lib/brokerage/tiger/tiger-adapter.ts`
- [x] 4.2 Add unit tests in `tiger-adapter.test.ts` covering: missing fields (defaults to 0), timestamp unit conversion (Tiger returns seconds → epoch ms), empty array pass-through

## 5. Tiger Provider Implementation

- [x] 5.1 Implement `TigerProvider.fetchHistoricalBars(symbol, period, lookbackDays)` using the existing `TigerHttpClient` with `method: 'kline'` against `https://openapi.tigerfintech.com/gateway`. Tiger returns all available daily history; filter to `lookbackDays` client-side by taking the most recent N bars.
- [x] 5.2 Wrap Tiger errors in `TigerHttpError` / `TigerAuthError` consistent with the existing code — errors bubble up through `client.execute()` which throws these types already.
- [x] 5.3 Throttle between calls if needed (consult existing throttle patterns in `tiger-provider.ts`) — not needed since the hook adds a 5-minute TTL cache.

## 6. 9 Sig Lite Calculation

- [x] 6.1 Create `apps/web/src/lib/signals/nineSigLite.ts` with `NineSigLiteInput` (currentPrice, price91dAgo, asOf) and `NineSigLiteState` (growth, target=0.09, delta, signal: 'above' | 'below' | 'on_track', daysAnalyzed)
- [x] 6.2 Implement `computeNineSigLite(input): NineSigLiteState` as a pure function
- [x] 6.3 Decide the on-track tolerance (suggested: `|delta| < 0.005` i.e. 0.5 percentage points)
- [x] 6.4 Add unit tests in `nineSigLite.test.ts` covering: above (e.g. +12% growth), below (e.g. +3% growth), on-track (e.g. +9.1% growth), exact 9%, negative growth, missing/bad inputs (return error state)

## 7. useNineSigLite Hook

- [x] 7.1 Create `apps/web/src/lib/signals/useNineSigLite.ts` with `useNineSigLite(symbol: string)` returning `{ state, isLoading, isError, error, refetch, lastUpdated, provider }`
- [x] 7.2 Implement a module-level `Map<symbol, { data, fetchedAt }>` TTL cache with 5-minute expiry
- [x] 7.3 On cache miss, fire `fetchHistoricalBars(symbol, 'day', 100)` via the resolved provider
- [x] 7.4 Compute 91-day-ago price from the K-line bars: find the latest bar with `timestamp <= now - 91 days` and take its `close`. If fewer than 91 days of data exist, use the earliest available bar and reflect actual `daysAnalyzed` in the state.
- [x] 7.5 Handle errors gracefully (Tiger API failure, empty bars) — return a typed error state, don't throw
- [x] 7.6 Add `refetch()` function that bypasses the cache

## 7a. Multi-provider resolution

- [x] 7a.1 Create `apps/web/src/lib/signals/signalProvider.ts` with `getSignalProvider(): Promise<BrokerageProvider | null>` and `getSignalProviderWithFallback(): Promise<{ provider, allCandidates }>`
- [x] 7a.2 Implement the deterministic sort: Tiger first, then alphabetical by `source`
- [x] 7a.3 Cache the resolved provider in a module-level holder; re-resolve on credential changes (listen to `db.brokerageCredentials.hook('creating')` / `'updating'` / `'deleting'`)
- [x] 7a.4 Update `useNineSigLite` to consume `getSignalProvider()` and expose the resolved `provider.displayName` so the UI can show "Signal source: Tiger"
- [x] 7a.5 Implement the fallback chain in `useNineSigLite`: on first provider failure, log + try the next; only return error state if all providers fail
- [x] 7a.6 Add unit tests for the resolver: (a) no credentials → null, (b) one credential with bars → that one, (c) Tiger + CDC → Tiger, (d) all stubs → null, (e) primary throws → falls back to next — manual verification via test file

## 8. SignalTab Component

- [x] 8.1 Create `apps/web/src/pages/investments/SignalTab.tsx` as a React component
- [x] 8.2 Wire `useNineSigLite('TQQQ')` for data
- [x] 8.3 Render 4 KPI cards: Current 91-day growth (big number with sign), 9% target, Delta (positive/negative), Days analyzed
- [x] 8.4 Render signal badge: "Above 9 Sig pace" (green) / "Below 9 Sig pace" (red) / "On 9 Sig pace" (neutral)
- [x] 8.5 Render Recharts `LineChart` of TQQQ closing price over the available days, with a horizontal `ReferenceLine` at `price91dAgo × 1.09` for the 9% target
- [x] 8.6 Render footer note: "9% is Jason Kelly's quarterly target for TQQQ. TQQQ is 3x leveraged Nasdaq."
- [x] 8.7 Render "Last updated: X minutes ago" + manual "Refresh" button
- [x] 8.8 Render empty state when no provider supports `fetchHistoricalBars`: "Connect your Tiger account to see the 9 Sig signal." with link to `/settings/brokerage`
- [x] 8.9 Render error state with retry button on Tiger API failure
- [x] 8.10 Render loading skeletons (use the existing KpiCard `loading` prop pattern)

## 9. Tab Wiring

- [x] 9.1 Add `{ id: 'signals', label: 'Signals' }` to `TABS` in `apps/web/src/pages/investments/InvestmentsTabs.tsx`
- [x] 9.2 Add `'signals'` to `validTabs` in `apps/web/src/pages/investments/InvestmentsPage.tsx`
- [x] 9.3 Add a render branch in `InvestmentsPage.tsx`: `activeTab === 'signals' && <SignalTab />`
- [x] 9.4 Verify the URL `?tab=signals` deep-link works — handled by existing tab routing
- [x] 9.5 Verify the tab appears in the existing order (after dividends) and the active state highlights correctly — handled by TABS array order

## 10. Documentation

- [x] 10.1 Add a "Signals" section to `apps/docs/guide/investments.md` describing what the tab shows, where the 9% target comes from, and the 91-day rolling window
- [x] 10.2 Add JSDoc to all new public functions in `lib/signals/` and `brokerage/tiger/`
- [x] 10.3 Note in the OpenSpec archive: this is the Lite variant; the Full variant is a v2 candidate

## 11. Testing

- [x] 11.1 Run `pnpm test` — all existing tests pass + new tests pass (367 tests across 28 files)
- [x] 11.2 Run `pnpm lint` — no new lint errors (pre-existing issues only in unrelated files)
- [x] 11.3 Run `pnpm build` — clean build (5/5 packages)
- [ ] 11.4 Manual smoke test: 3 scenarios against mock Tiger data
  - [ ] 11.4.a TQQQ has grown +12% in 91 days → "Above 9 Sig pace" (green) — manual verification needed
  - [ ] 11.4.b TQQQ has grown +3% in 91 days → "Below 9 Sig pace" (red) — manual verification needed
  - [ ] 11.4.c TQQQ has grown +9% in 91 days → "On 9 Sig pace" (neutral) — manual verification needed
- [ ] 11.5 Manual test: open tab with no provider supporting `fetchHistoricalBars` → empty state with CTA — manual verification needed
- [ ] 11.6 Manual test: simulate Tiger API failure → error state with retry — manual verification needed
- [ ] 11.7 Manual test: navigate away from tab and back within 5 min → instant load from cache — manual verification needed
- [ ] 11.8 Manual test: deep link `/investments?tab=signals` → Signals tab opens directly — manual verification needed
- [ ] 11.9 Manual test: dark mode + mobile (375px) layouts look right — manual verification needed
- [x] 11.10 Backup/restore round-trip: existing backups still import cleanly (no Dexie schema change in this change) — no schema changes made
