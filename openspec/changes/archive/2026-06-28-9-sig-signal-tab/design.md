## Context

Lokfi's investment page (`/investments`) is a tabbed hub that shows holdings, transactions, dividends, and closed positions synced from Tiger Broker via `TigerProvider` (custom HTTP client using RSASSA-PKCS1-v1_5 signing — no `tigeropen` SDK). The tab system, `KpiCard` pattern, Recharts theme, and Dexie v10 data layer are all in place. There is no live market data today — the closest is `BrokeragePosition.marketValue` written during sync, which is stale by definition.

The 9% Signal (9 Sig) is Jason Kelly's quarterly TQQQ rebalancing plan: compare TQQQ to a 9% growth target each quarter. For this v1 Lite, we don't track the user's plan — we just compute the "is TQQQ above or below the 9% quarterly pace" indicator using a rolling 91-day window. The full plan-tracking variant was considered and explicitly rejected to keep v1 tight.

Tiger OpenAPI exposes the K-line endpoint we need for this feature (per `.claude/skills/tigeropen-typescript/references/quote.md`):
- `kline` → historical daily bars; the latest bar's `close` serves as current price (no separate quote call needed)

The existing `TigerHttpClient` (`apps/web/src/lib/brokerage/tiger/tiger-http-client.ts`) is the right place to add these — it already handles auth signing and error mapping.

## Goals / Non-Goals

**Goals:**
- User can see TQQQ's 91-day growth at a glance and compare it to the 9% Kelly target
- User can see whether the market is currently above, below, or on the 9% quarterly pace
- User can refresh the signal manually; data is no older than 5 minutes
- No new dependencies, no new auth, no new database tables
- The tab works even if the user has no TQQQ position in Tiger — it's a market read, not a portfolio read

**Non-Goals:**
- No plan setup form, no start date, no starting value input (Lite interpretation)
- No rebalance action ("buy X / sell Y") — the tab is informational, not actionable
- No bond fund tracking
- No auto-refresh polling (manual refresh button only in v1)
- No multi-instrument selector (TQQQ only; QQQ toggle is v2)
- No 3 Sig / 6 Sig variants
- No persistent price history in Dexie (in-memory TTL cache only)
- No order placement or Tiger write calls

## Decisions

### 1. Tiger `kline` for the 91-day window (only call we actually need)

**Decision**: Use Tiger's `kline` endpoint for the 91-day price history. The latest bar's close is our "current price" — we don't need a separate `quote_brief` call.

**API shape (verified against live Tiger responses):**
- `kline` — `bizContent: { account, symbols: ['TQQQ'], period: 'day' }` → wrapped in `{symbol, period, items: [bar, bar, ...]}`
- `kline` does NOT accept `begin_time` / `end_time` / `limit` — those are unknown keys and cause 1010 errors. Tiger returns all available daily history; filter to `lookbackDays` client-side.
- Singular `symbol` (instead of `symbols: [...]`) returns error 1010: "biz param error(symbols format error, need to be an array)"
- `quote_brief` is NOT used in v1 — it requires a separate "quote permission" toggle not available to all users (verified: Error 4). The latest kline bar's `close` is the current price.

**Rationale:**
- Single round trip, no permission dependency
- Latest bar's close is the official end-of-day price
- No new dependency, no new auth — Tiger's `tigerId/privateKey/account` is sufficient

**Alternative considered:** Polling Tiger's `position` data for `marketValue` (already in the sync pipeline). Rejected because it's stale by definition — only updates on full sync.

### 2. 91-day rolling reference, not calendar-quarter-aligned

**Decision**: Compare current TQQQ price to its price 91 days ago. Don't try to align with Kelly's exact Jan/Apr/Jul/Oct quarter boundaries.

**Rationale:**
- 91 days is a clean quarterly proxy
- No calendar logic required — a single K-line lookup, no quarter-boundary edge cases
- The signal is a "running pace" indicator, not a "rebalance trigger"
- Kelly's full plan uses calendar quarters, but a Lite indicator doesn't need to

**Alternative considered:** Calendar-quarter alignment (fetch TQQQ price on the most recent Jan/Apr/Jul/Oct 1, prorate the 9% target). Rejected as overkill for a Lite feature; revisit if the Full variant ships.

### 3. In-memory TTL cache, no Dexie persistence

**Decision**: Cache the last successful kline bars in a module-level `Map` keyed by symbol with a 5-minute TTL. No Dexie table.

**Rationale:**
- Tiger rate limits — don't hammer the API on every tab switch
- 5 minutes is the right freshness for a quarterly indicator
- A new Dexie table (v11) is overkill for ephemeral market data
- If the user navigates away and back within 5 minutes, the tab opens instantly

**Alternative considered:** Persisting daily K-line in Dexie (`brokerageKlineBars` table) to avoid re-fetching on every tab open. Rejected — premature optimization for v1; we can add it later if rate limits become a real problem.

### 4. Default to TQQQ, no instrument selector in v1

**Decision**: The tab tracks TQQQ (3x leveraged Nasdaq). No user-facing instrument selector.

**Rationale:**
- TQQQ is the actual Kelly Letter 9 Sig vehicle — 9% quarterly target assumes the 3x leverage
- An unleveraged QQQ toggle would mean re-defining the target (9% TQQQ = ~3% QQQ)
- One less UI decision in v1; can be added as a dropdown later without changing the calculation engine

### 5. No plan setup form, read-only

**Decision**: The tab is read-only. There is no plan setup form, no start date, no starting value input. The signal is purely a market read.

**Rationale:**
- This is the Lite variant the user explicitly chose over the Full plan tool
- Most 9 Sig users already have the plan in their head; the tab answers "where is the market right now?"
- The Full variant (with plan setup) is a v2 if the Lite is well-received

### 6. Multi-provider resolution — first available that supports historical bars

**Decision**: The Signals tab picks the first configured provider (in deterministic order) that implements `fetchHistoricalBars`. TQQQ's price is identical across all US-accessible brokers since they all tap the Nasdaq consolidated tape, so the choice is purely about which auth/API path to use, not about data quality.

**Resolver logic** (in `apps/web/src/lib/signals/signalProvider.ts`):
- Read all rows from `db.brokerageCredentials`
- Sort: Tiger first, then alphabetical by `source` (deterministic across sessions)
- For each credential, instantiate its `BrokerageProvider` and check it exposes `fetchHistoricalBars`
- Return the first match; skip on instantiation error or missing method
- Cache the resolved provider in a module-level `WeakRef`-style holder for the session (re-resolve on credential changes)
- Return `null` if none qualify → empty state with the usual "connect a broker" CTA

**Rationale:**
- TQQQ is a single instrument on a single exchange; price is identical across providers
- "First available" is the simplest rule that works and degrades gracefully
- No new UI for choosing a provider — the user doesn't care which one we ask, as long as the number is right
- Easy to upgrade to a user-selectable dropdown in v2 if anyone asks

**Fallback on error**: If the primary provider's call fails (auth expired, rate limit, network), log the error and fall through to the next provider. Only show an error state if all configured providers fail.

**UI hint**: The tab footer shows "Signal source: {provider.displayName}" so the user knows where the data is coming from. If more than one provider is connected, it shows "Signal source: Tiger (you have 2 connected brokers)".

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| **Tiger API rate limits** — frequent tab opens could hit the per-minute limit | 5-minute in-memory TTL cache; manual refresh is the only way to force a refetch |
| **Tiger API failure** — `kline` returns error | Show inline error card with retry button; don't crash the tab |
| **No Tiger credentials configured** — `validateConnection()` returns false | Empty state with link to `/settings/brokerage` (same pattern as other tabs) |
| **91-day lookback crosses a quarter boundary** — signal is slightly off vs Kelly's exact cadence | Acceptable for a Lite read; document the 91-day rolling behavior in the tab footer |
| **TQQQ is 3x leveraged** — signal is more volatile than QQQ | Note in the tab: "TQQQ is 3x leveraged Nasdaq. Signal amplifies QQQ moves ~3x." |
| **Stale price on first tab open** — first load waits for the fetch | Skeleton KPI cards + chart placeholder; show "Updating..." badge |

## Open Questions

1. Should the tab auto-refresh every N minutes while open, or stay manual? **Current stance:** manual only in v1. Auto-refresh is a v2 if requested.
2. Should the 9% target be configurable per user (some Kelly subscribers run different targets)? **Current stance:** hard-coded 9% in v1. Add a setting if the Full variant ships.
3. Should we also show a QQQ (unleveraged) signal alongside TQQQ? **Current stance:** no, in v1. Single instrument keeps the UI clean.
4. Should the user be able to override the provider selection in v2? **Current stance:** no in v1; revisit if users with multiple US brokers request it.
