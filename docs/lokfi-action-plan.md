# stmt-parser — Rearchitecture & Launch Action Plan

> Co-authored by Jermyn & Claude · March 2026

---

## 1. Current State Audit

### What's already built (solid foundations)

**Parser engine** (`stmt-parser/` — Deno/TypeScript CLI)
- PDF parsers for: OCBC credit, OCBC debit, Citibank credit, UOB credit, CDC debit
- Clean type system: `Transaction`, `ConsolidatedTransaction`, `Statement`, `DebitStatement`, `CreditStatement`
- Outputs a consolidated `transactions.json` from all statement files
- Parser interface (`StatementParser`) is well-designed for extension

**Web frontend** (`src/` — Next.js 15, React 19, shadcn/ui, Tailwind)
- Transaction table (TanStack Table) with filtering and column visibility
- Rule engine: create categorisation rules with "contains" operation on description/source/accountNo/hash
- Bulk categorise: select N transactions → assign category → auto-creates hash-pinned rules
- Stats page: stacked bar chart, date range filter, category visibility toggle, monthly average
- Profile page: export/import full profile as JSON (rules + transactions)
- Dark/light theme toggle, sidebar navigation

**Local-first data model**
- All state in localStorage via a `TransactionsProfile` object
- Profile is portable (download/upload JSON)
- No server, no account, no cloud — privacy by design

---

## 2. Critical Architecture Problems (Rearchitecture Triggers)

### Problem 1: Two-step CLI workflow kills usability  ❌ BLOCKER
The current flow is:
1. Put PDFs in `stmt-parser/statements/{bank}/{type}/`
2. Run `deno task start` in terminal
3. Upload the output `transactions.json` to the web app

This is **completely inaccessible to non-technical users** and adds friction even for developers. The rearchitecture must collapse this into a single drag-and-drop interaction: drop PDFs → see transactions.

**Solution:** Move PDF parsing into the browser using `pdfjs-dist` (Mozilla PDF.js — same library). Run parsers as WebAssembly in-browser. Zero server required.

### Problem 2: localStorage will hit limits 📦
A year of transactions from 4 accounts easily exceeds 5MB (the typical localStorage cap per origin). Profiles already store full transaction data + rules.

**Solution:** Migrate storage to **IndexedDB** (via Dexie.js). IndexedDB supports hundreds of MB of structured data, is indexed for fast queries, and is still entirely local.

### Problem 3: Parser and web app are tightly coupled
The web app imports types directly from `../../../stmt-parser/src/types` — a relative path into the Deno project. This breaks the separation of concerns and makes extracting the parser library hard.

**Solution:** Extract the parser as a standalone **npm/JSR package** (`@stmt-parser/core` or similar) with its own versioning. The web app consumes it as a dependency.

### Problem 4: Only "contains" rule operation is limited
The rule engine currently only supports `contains`. Real categorisation needs amount thresholds, exact match, regex, date-based rules, source-based rules.

---

## 3. Feature Gaps Inventory

### UX / Onboarding
| Gap | Priority | Notes |
|-----|----------|-------|
| No landing/onboarding page | P0 | First-time user sees a blank transactions table |
| Raw HTML file input (no drag-and-drop) | P0 | Must support direct PDF upload |
| Empty state UI | P0 | Nothing guides user when no data loaded |
| `alert()` used in profile page | P1 | Replace with toast notifications |
| Stats chart hardcoded to 1200×1200px | P1 | Not responsive, overflows on most screens |
| No "uncategorised" quick filter | P1 | Hard to triage new transactions |
| No onboarding/quick-start guide | P2 | Needed for public launch |

### Rule Engine
| Gap | Priority | Notes |
|-----|----------|-------|
| Only `contains` operation | P1 | Add: `equals`, `startsWith`, `regex`, `amount >`, `amount <`, `amount between` |
| No rule ordering / priority | P2 | Later rule overrides earlier — not explicit |
| No rule testing UI | P2 | "How many transactions does this rule match?" |
| No rule import/export (separate from profile) | P3 | Share rule packs between users |

### Analytics & Visualisation
| Gap | Priority | Notes |
|-----|----------|-------|
| Single chart type (stacked bar only) | P1 | Add: monthly trend line, category pie/donut, top merchants |
| No income vs expense split | P1 | Currently all transactions mixed, no net cashflow view |
| No summary/dashboard cards | P1 | Total spend this month, vs last month, top category |
| No savings rate tracking | P2 | Income minus expense over time |
| No merchant-level drilldown | P2 | "Show all GrabFood transactions" |

### Bank Coverage (SG-specific)
| Bank | Debit | Credit | Priority |
|------|-------|--------|----------|
| OCBC | ✅ | ✅ | Done |
| Citibank | — | ✅ | Done |
| UOB | — | ✅ | Done |
| CDC | ✅ | — | Done |
| **DBS/POSB** | ❌ | ❌ | **P0 — largest SG bank** |
| **UOB debit** | ❌ | — | P1 |
| **Maybank** | ❌ | ❌ | P1 |
| Standard Chartered | ❌ | ❌ | P2 |
| HSBC | ❌ | ❌ | P2 |
| GXS / Trust / Maribank | ❌ | ❌ | P3 — digital banks, format TBC |

### AI / Agentic Features
| Gap | Priority | Notes |
|-----|----------|-------|
| AI categorisation (planned) | P2 | Optional, LLM-powered, opt-in |
| Smart category suggestions | P2 | Suggest category when editing a transaction |
| Anomaly detection | P3 | "This month's dining spend is 40% higher than usual" |

---

## 4. Rearchitecture Plan

### New Architecture Overview

```
[PDF Files] → drag-drop → [Browser PDF Parser (pdfjs-dist)]
                                    ↓
                         [Parser Core Library (npm package)]
                           OCBC / Citibank / UOB / DBS / ...
                                    ↓
                         [Transaction Store (IndexedDB / Dexie)]
                                    ↓
                    ┌──────────────────────────────────┐
                    │         Next.js Web App           │
                    │  Dashboard · Transactions · Rules │
                    │  Stats · Profile · AI (optional)  │
                    └──────────────────────────────────┘
```

**No server. No cloud. No account. All local.**

### Repo Structure (new)

```
/
├── packages/
│   └── parser-core/          # Standalone npm package
│       ├── src/
│       │   ├── parsers/
│       │   │   ├── ocbc/
│       │   │   ├── dbs/
│       │   │   ├── uob/
│       │   │   ├── citibank/
│       │   │   └── ...
│       │   ├── types.ts
│       │   └── index.ts
│       └── package.json
├── apps/
│   └── web/                  # Next.js web app (current src/)
│       └── ...
└── package.json              # pnpm/turborepo monorepo root
```

### Storage: localStorage → IndexedDB (Dexie.js)

```
Tables:
  transactions     { id, hash, source, accountNo, date, amount, description, category }
  rules            { id, name, priority, conditions[], category }
  categories       { id, name, color, icon }
  settings         { key, value }
```

Benefits: indexed queries, no size limits, still fully local.

### PDF Parsing in Browser

Replace the Deno CLI step with in-browser parsing using `pdfjs-dist`:
- User drops one or more PDFs
- App auto-detects bank from PDF metadata/content
- Parses in a Web Worker (non-blocking UI)
- Deduplicates against existing transactions by hash
- Shows a "X new transactions imported" confirmation

---

## 5. Phased Execution Plan (12 Weeks)

### Phase 1 — Foundation (Weeks 1–2)
**Goal: Rearchitect without breaking what works**

- [ ] Set up pnpm monorepo with `packages/parser-core` and `apps/web`
- [ ] Extract parser types and parsers into `parser-core` npm package
- [ ] Integrate `pdfjs-dist` for in-browser PDF parsing (replace Deno CLI)
- [ ] Migrate storage from localStorage to IndexedDB via Dexie.js
- [ ] Set up PDF auto-detection (bank identification from PDF content)
- [ ] Drag-and-drop PDF upload UI with import progress/results

**Milestone: Drop PDFs, see transactions. No CLI step.**

---

### Phase 2 — Core Feature Polish (Weeks 3–5)
**Goal: Make it something you're proud to show people**

- [ ] Landing/onboarding page (what is this, how to use it, get started CTA)
- [ ] Empty state UI across all pages
- [ ] DBS/POSB credit parser (highest priority missing bank)
- [ ] UOB debit parser
- [ ] Expand rule engine operations: `equals`, `startsWith`, `regex`, `amount >`, `amount <`, `amount between`
- [ ] "Uncategorised" quick filter in transaction table
- [ ] Replace all `alert()` with toast notifications
- [ ] Responsive stats chart (replace fixed 1200×1200 MUI chart)
- [ ] Income vs expense split in stats

**Milestone: A non-technical SG user can import DBS + OCBC statements and see a proper spend breakdown.**

---

### Phase 3 — Analytics & Insights (Weeks 6–8)
**Goal: The "aha moment" — seeing your money clearly**

- [ ] Dashboard page: summary cards (this month spend, vs last month, savings rate, top category)
- [ ] Monthly trend line chart
- [ ] Category pie/donut chart
- [ ] Top merchants view
- [ ] Date range presets (This month, Last month, Last 3 months, YTD, Custom)
- [ ] Category drilldown: click a category → see all its transactions
- [ ] Export to CSV
- [ ] Maybank parser

**Milestone: Someone replaces their current Excel/Notion finance tracker with this.**

---

### Phase 4 — AI & Launch Prep (Weeks 9–12)
**Goal: Ship publicly and start monetising**

- [ ] AI categorisation (opt-in): user provides own OpenAI/Anthropic API key — processes uncategorised transactions via LLM
- [ ] Smart category suggestions when manually editing transactions
- [ ] Proper README and user documentation
- [ ] GitHub repository polish: contribution guide, issue templates, bank parser request template
- [ ] Landing page copy and positioning ("Privacy-first expense tracker for Singapore")
- [ ] Product Hunt launch preparation
- [ ] Set up Gumroad listing (paid packaged release / premium features)
- [ ] Standard Chartered parser

**Milestone: Public GitHub launch + first paid customer.**

---

## 6. Monetisation Strategy (Revised from Donations)

### Model: Open Core + Paid Packaged Release

| Tier | What | Price |
|------|------|-------|
| **Free (OSS)** | Parser core library on GitHub/npm, basic web app | Free forever |
| **Packaged Release** | Pre-built installer, auto-updates, without needing Node.js/npm setup | $15 one-time on Gumroad |
| **AI Add-on** | Agentic categorisation credits or BYOK setup guide | $5 one-time or included in packaged release |
| **Future: Rules Pack** | Pre-built rule sets for common SG spending patterns | $5 on Gumroad |

**Why this works:**
- OSS community builds trust and grows the moat (more bank parsers contributed)
- Paid release targets the non-developer SG user who wants it "just working"
- Price anchors well against Dobin (free but cloud) — users who value privacy will pay $15
- No subscriptions, no recurring billing complexity in the first version

### Distribution Channels
1. r/singaporefi — privacy-conscious finance crowd, ideal early adopters
2. HardwareZone finance forum — large SG audience
3. Dev.to / Medium — technical write-up on building SG bank parsers
4. Product Hunt — broader reach on launch day
5. GitHub Topics: `singapore`, `bank-statement`, `expense-tracker`, `personal-finance`

---

## 7. Success Metrics (3-Month Targets)

| Metric | Target |
|--------|--------|
| GitHub stars | 100+ |
| Active users (self-reported in issues/discussions) | 50+ |
| Bank parsers supported | 8+ (add DBS, UOB debit, Maybank, SCB) |
| Gumroad sales | 10+ (first revenue dollar) |
| Community-contributed parsers | 1+ |

---

## 8. What We Build Together

| Jermyn | Claude |
|--------|--------|
| DBS/POSB parser (need actual statement to reverse-engineer) | Scaffold all boilerplate, parser test harnesses, monorepo setup |
| Architecture decisions, final code review | Draft parsers for new banks once format is described |
| UX direction and design taste | React component scaffolding, Dexie.js integration, rule engine expansion |
| Real data validation | Write README, landing page copy, Product Hunt blurb |
| Launch distribution (personal network, communities) | SEO metadata, GitHub repo polish |

---

*Next step: agree on Phase 1 scope, then start the monorepo setup together.*
