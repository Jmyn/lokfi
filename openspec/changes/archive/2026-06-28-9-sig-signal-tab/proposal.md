## Why

The Investments page (`/investments`) currently shows what the user holds, what they paid, and what dividends they've earned — but offers no read on **where the market is right now**. Users who follow Jason Kelly's 9% Signal plan from *The Kelly Letter* want a quick "is TQQQ keeping pace with the 9% quarterly target?" check without opening a separate charting tool or doing the math in their head.

Today they have to: open Tiger, look up TQQQ, remember the price 91 days ago, divide, and decide. Lokfi already has the brokerage credentials, the routing, the tab system, and the chart/KPI patterns in place. The only missing piece is a live price feed from Tiger. Adding a Signals tab costs one new Tiger method and one new tab component.

## What Changes

- Add **Signals tab** to the `/investments` page, sitting after Dividends
- Build a **9 Sig Lite indicator card** showing TQQQ's 91-day growth vs the 9% quarterly target, with a directional signal
- Extend `BrokerageProvider` interface with `fetchHistoricalBars()` method
- Implement `fetchHistoricalBars()` on `TigerProvider` using the existing `TigerHttpClient` (no new dependencies, no new auth flow)
- Add a `useNineSigLite(symbol)` hook that combines the two calls with in-memory caching and 5-minute TTL
- Render a 91-day TQQQ line chart with a horizontal 9% reference line (Recharts)
- **No new Dexie tables**, **no new packages**, **no new dependencies**

## Capabilities

### New Capabilities

- `tiger-kline-feed`: `fetchHistoricalBars()` method on `BrokerageProvider`; Tiger implementation
- `signal-tab`: Signals tab in `/investments`; 9 Sig Lite indicator (KPI cards + line chart + signal badge); refresh button; empty/error states

## Impact

- `packages/brokerage-core/src/types.ts` — add `BrokerageKlineBar` type
- `packages/brokerage-core/src/provider.ts` — add `fetchHistoricalBars` to `BrokerageProvider` interface
- `apps/web/src/lib/brokerage/tiger/tiger-types.ts` — add `TigerKlineBar` raw type
- `apps/web/src/lib/brokerage/tiger/tiger-adapter.ts` — add `adaptKlineBars` pure function
- `apps/web/src/lib/brokerage/tiger/tiger-provider.ts` — implement `fetchHistoricalBars`
- `apps/web/src/lib/brokerage/tiger/tiger-adapter.test.ts` — unit tests for new adapters
- `apps/web/src/lib/signals/nineSigLite.ts` — pure function `computeNineSigLite`
- `apps/web/src/lib/signals/nineSigLite.test.ts` — unit tests (above / below / on track / boundary)
- `apps/web/src/lib/signals/useNineSigLite.ts` — data hook with in-memory TTL cache
- `apps/web/src/pages/investments/SignalTab.tsx` — new tab component
- `apps/web/src/pages/investments/InvestmentsTabs.tsx` — register `'signals'` in `TABS`
- `apps/web/src/pages/investments/InvestmentsPage.tsx` — add `'signals'` to `validTabs`; render branch
- `apps/docs/guide/investments.md` — document the new tab
