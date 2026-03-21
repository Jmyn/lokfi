# Lokfi — Product Design Document

> Version 1.1 · March 2026 · Jermyn & Claude

---

## 1. Product Vision

> **"See where your money actually goes — without giving it to anyone."**

Lokfi is the expense tracker for people who care about privacy. Your bank statements never leave your device. No account, no subscription, no cloud. Just drop your statements and get clarity on your spending.

**Target users:**

- Optimise for Singapore residents and financial institutions
- FIRE community members who track spending obsessively and value control
- Privacy-conscious individuals who refuse to connect their bank accounts to third-party apps

---

## 2. Core User Journey

### First-Time User (Onboarding)

```
Land on /
  ↓
See: what is Lokfi, how it works (3-step explainer), privacy promise
  ↓
CTA: "Import your first statement"
  ↓
Land on /import
  ↓
Drag-and-drop one or more PDF bank statements
  ↓
App auto-detects bank + account type
  ↓
Parsing happens in background (progress indicator)
  ↓
"Successfully imported 87 transactions from OCBC Savings (Jan–Mar 2025)"
  ↓
Redirect to /transactions — see the full table
  ↓
Prompt: "Want to categorise your spending? Set up rules →"
```

### Returning User (Ongoing Import)

```
Open app → straight to /transactions or /dashboard
  ↓
Click "Import" → drop new month's PDF
  ↓
"12 new transactions imported, 3 duplicates skipped"
  ↓
New transactions appear at the top, uncategorised filter active
  ↓
Categorise manually or via rules
```

### Power User (Rule Setup)

```
Notice uncategorised transactions from "GRAB*" merchant
  ↓
Select all GRAB transactions → Bulk categorise → "Transport"
  ↓
Sets manualCategory directly on each selected transaction (no rules created)
  ↓
Optionally: "Create Rule for Similar Transactions" → general rule on description
  ↓
Alternatively: go to /transactions/rules → "New rule"
  → Condition: description contains "GRAB" → Category: Transport
  ↓
All future GRAB transactions auto-categorised on import
```

---

## 3. Page Designs

### `/` — Landing Page

**Purpose:** Convert a curious visitor to an active user. Establish trust. No fluff.

**Sections:**

1. **Hero** — tagline, one-sentence description, "Import your first statement" CTA, small privacy badge ("100% local — data never leaves your device")
2. **How it works** — 3-step visual: (1) Drop PDF → (2) See transactions → (3) Understand your spending
3. **Supported banks** — logo grid: OCBC, DBS, UOB, Citibank, CDC, Maybank + "More coming" badge
4. **Privacy section** — open source badge, MIT license note, link to GitHub for auditing
5. **Footer** — GitHub link, Gumroad link (desktop app), version

**Design notes:**

- Clean, minimal — no dashboard screenshot overload
- Monochrome with a single accent colour (to be decided)
- No cookie banners, no analytics, no tracking pixels

---

### `/import` — PDF Import

**Purpose:** The primary action. Must feel fast, confident, and clear.

**Components:**

- Large drag-and-drop zone (full-width) with dashed border, drop icon, helper text
- "Or click to browse files" fallback
- Accepts multiple files in one drop
- Per-file status list: filename → detected bank/type → ✅ parsed / ❌ error
- Summary banner: "X transactions imported, Y duplicates skipped"
- "View transactions" CTA on completion

**Error states:**

- Unsupported format: "We couldn't recognise this statement. [Request support →]" (links to GitHub issue template)
- Parse error: show bank + type + raw error message for debugging

**Design notes:**

- Optimistic UI — show each file being processed in real-time as the Web Worker completes each one
- Never show a spinner blocking the whole page; files process in parallel

---

### `/transactions` — Transaction Table

**Purpose:** Browse, filter, search, and categorise all imported transactions.

**Table columns:**

- Date (sortable)
- Description
- Source (bank)
- Account No
- Amount (right-aligned; red = outflow, green = inflow)
- Category (editable inline — dropdown)

**Filters / controls (top bar):**

- Search: full-text across description + source + accountNo
- Date range picker (presets: This month, Last month, Last 3 months, YTD, Custom)
- Category filter (multi-select)
- "Uncategorised only" quick toggle — P0 for triage
- Column visibility toggle

**Bulk actions (row selection):**

- Select N rows → "Categorise selected" → pick category → sets `manualCategory` on each row
- Optional follow-up: "Create Rule for Similar Transactions" → creates a general `contains` rule

**Empty state:**

- "No transactions yet" → "Import your first statement →"

---

### `/transactions/rules` — Rule Engine

**Purpose:** Create and manage automatic categorisation rules.

**Rule list:**

- Ordered by priority (drag to reorder — P2)
- Each rule shows: name, conditions summary, category, match count (lazy)
- Toggle active/inactive per rule

**Rule editor (modal or inline):**

- Rule name (optional, auto-generated if blank)
- One or more conditions (AND logic):
  - Field: description / source / accountNo / transactionValue
  - Operation: contains / equals / startsWith / regex / > / < / between
  - Value: text input or numeric input(s)
- Category: dropdown (with "create new category" inline)
- Preview: "X existing transactions match this rule"

**Design notes:**

- Rule priority ordering: show numeric badge, allow drag-to-reorder in Phase 2
- Rule Simulator input (Phase 2): paste a description → see which rules match in order

---

### `/dashboard` — Summary & Insights

**Purpose:** The "at a glance" view that replaces the user's mental model. (Replaces `/stats` from earlier designs.)

**Summary cards:**

- Total spend this month (vs last month: +12% / -8%)
- Savings rate this month (income minus expense / income)
- Top spending category (with % of total)
- Uncategorised transactions count (CTA to review)
- Top merchants widget

**Widgets:**

- Monthly trend line chart
- Category pie/donut chart
- Category budget bars
- Spending heatmap
- Savings rate gauge
- Average spending comparison

**Controls:**

- Date range (same presets as transactions)
- Category visibility toggle (show/hide categories from charts)
- Income / expense toggle (show both, only income, only expense)

**Design notes:**

- All charts fully responsive — no fixed pixel dimensions
- Charts respect dark/light theme
- Tooltip on hover: date, category, amount

**Insights (Phase 4 — AI powered):**

- "Your dining spend is 40% higher than your 3-month average"
- "You haven't categorised 23 transactions from last month"

---

### `/profile` — Data Management

**Purpose:** Full ownership and portability of user data.

**Sections:**

- **Export profile** — download all data (transactions + rules + categories) as a single JSON file
- **Import profile** — restore from a previously exported JSON
- **Clear data** — delete all transactions / all rules / everything (with confirmation)
- **Accounts summary** — list of linked bank accounts (source + accountNo), with transaction count and date range

**Design notes:**

- Replace all `alert()` calls with shadcn `<Toast>` notifications
- Destructive actions require a confirmation dialog (not window.confirm)

---

## 4. UX Principles

**1. Zero to value in one drop**
A user should see their own transactions within 30 seconds of landing on the app. The import flow must be frictionless.

**2. Never lose data**
Before any destructive action (clear data, overwrite import), show what will be lost and require explicit confirmation. Profile export is always one click away.

**3. Errors are actionable**
Every error message tells the user what happened and what they can do. "Unsupported format" links to a GitHub issue template. "Parse error" shows enough detail to file a bug report.

**4. Respect the user's screen**
No hardcoded pixel dimensions. All layouts are responsive. The app works at 1280px wide and 375px wide.

**5. Dark mode is first class**
Dark theme is the expected default for the target audience. Both themes must be tested for every new component.

---

## 5. Design System Decisions

| Decision | Choice | Notes |
|----------|--------|-------|
| Component library | shadcn/ui (Radix primitives) | Already integrated; accessible, unstyled-first |
| Styling | Tailwind CSS | Already integrated |
| Icons | lucide-react | Already integrated |
| Charts | Recharts | Replacing MUI x-charts |
| Toast notifications | shadcn `<Sonner>` | Replacing all `alert()` |
| Fonts | System font stack (or Geist) | Fast load, no external font request |
| Accent colour | TBD (iteration) | Candidates: indigo, teal, slate |
| Motion | Minimal — `transition-colors`, no gratuitous animation | Preference for calm, focused UI |

---

## 6. Accessibility

- All interactive elements keyboard-navigable
- Table rows support keyboard selection (shadcn/TanStack Table handles this)
- Colour is never the only indicator (e.g., amounts use +/- prefix in addition to colour)
- All charts have accessible text alternatives (tooltips, data tables as fallback — Phase 3)

---

## 7. Monetisation UX

The free web app has no prompts, upsells, or locked features. The Gumroad listing and GitHub README make the desktop app (paid) visible to users who want it, without interrupting the free experience.

**The only in-app monetisation touchpoint:** A subtle footer link "Get the desktop app →" and a mention in the `/profile` page under a "Lokfi Desktop" section (Phase 4).

---

## 8. Open Questions (to iterate on)

| Question | Current thinking |
|----------|-----------------|
| Accent colour | Indigo (neutral, not too "finance-y") or Teal |
| App icon / logo | Simple "L" wordmark or lo-fi waveform motif |
| Default categories | Ship with a sensible default set (Food, Transport, Shopping, Bills, Income, etc.) |
| Onboarding modal vs page | Full landing page at `/` — not a modal overlay |
| Rule priority UX | Drag-to-reorder (P2); numeric badge for now |
| Mobile support | Responsive layout required; optimised for desktop but must not break on mobile |

---

*Last updated: March 2026 · v1.1 — /dashboard replaces /stats, updated dashboard widgets list*
