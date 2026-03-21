# Lokfi — Task Tracker

> Deprecated. Use `docs/backlog.md` and `docs/done.md` instead.

## Phase 1 — Foundation

### 1A. Monorepo Scaffolding

- [x] 1A-1: Initialize pnpm workspace + Turborepo
- [x] 1A-2: Scaffold `packages/parser-core`
- [x] 1A-3: Scaffold `apps/web` with Vite + React 19
- [x] 1A-4: Scaffold `packages/parser-seed` (dev CLI)

### 1B. Parser Infrastructure & CDC Parser (CSV)

- [x] 1B-1: Implement `ParseError` and `generateTransactionHash`
- [x] 1B-2: Implement `CdcDebitParser` (CSV) in `parser-core`
- [x] 1B-3: Implement parser registry/auto-detect
- [x] 1B-4: Verify with `card_transactions_record_...csv` sample

### 1C. Parser Implementation

- [x] 1C-1: Implement OCBC Credit parser
- [ ] 1C-2: Implement OCBC Debit parser
- [ ] 1C-3: Implement Citibank Credit parser
- [ ] 1C-4: Implement UOB Credit parser
- [x] 1C-5: Implement CDC Debit parser
  
### 1D. Database Layer (Dexie.js)

- [x] 1D-1: Implement Dexie database class
- [x] 1D-2: Implement default categories seed
- [x] 1D-3: Implement StorageManager persistence
- [x] 1D-4: Implement backup warning system

### 1E. PDF Parsing Pipeline

- [x] 1E-1: Create PDF Web Worker
- [x] 1E-2: Create `usePdfWorker` hook
- [x] 1E-3: Implement dedup + import pipeline

### 1F. Import Page UI

- [x] 1F-1: Build drag-and-drop upload zone
- [x] 1F-2: Build per-file status display
- [x] 1F-3: Build import summary banner

## Phase 2 — Core Feature Polish

### 2A. Landing Page

- [x] 2A-1: Build landing/onboarding page

### 2B. Transaction Table

- [x] 2B-1: Build transaction table
- [x] 2B-2: Implement table filters
- [x] 2B-3: Implement bulk categorisation
- [x] 2B-4: Implement empty state

### 2C. Rule Engine

- [x] 2C-1: Implement rule evaluation function
- [x] 2C-2: Build rule management page
- [x] 2C-3: Build rule editor (modal)
- [x] 2C-4: Apply rules on import
- [x] 2C-5: Implement Rule Simulator

### 2D. Stats Page

- [x] 2D-1: Build stats page with responsive charts
  - **Note:** Stats page (`/stats`) was replaced by Dashboard (`/dashboard`) in Phase 3A. Stats page code removed.

### 2E. Profile Page

- [x] 2E-1: Build profile page

### 2F. Navigation & Layout

- [x] 2F-1: Build app shell with sidebar navigation

### 2G. Magic Rule Creation

- [x] 2G-1: Implement `suggestRules` logic
- [x] 2G-2: Build `RuleSuggestionBar` UI
- [x] 2G-3: Integrate rule selection/customization into `TransactionsPage`

## Phase 3 — Analytics & Insights

### 3A. Dashboard

- [x] 3A-1: Build dashboard page with summary cards
- [x] 3A-2: Add monthly trend line chart
- [x] 3A-3: Add category pie/donut chart

### 3B. Advanced Analytics

- [x] 3B-1: Top merchants view
- [ ] 3B-2: Category drilldown
- [ ] 3B-3: Export to CSV

### 3C. Generic Fallback Parser

- [x] 3C-1: Implement generic CSV parser
- [x] 3C-2: Implement custom CSV parser
- [x] 3C-3: Implement generic PDF parser

## Phase 4 — Launch Preparation

- [x] 4-1: Clean up codebase for open sourcing (remove PII, local secrets)
- [x] 4-2: Create `LICENSE` (MIT) and `README.md`
- [ ] 4-3: Set up GitHub repository and `.github/FUNDING.yml`
- [ ] 4-4: Register domain and deploy landing page
- [ ] 4-5: Landing page final copy and SEO
- [ ] 4-6: Gumroad listing setup

## Phase 5 — Desktop App (Post-Launch)

- [ ] 5-1: Initialize Tauri in monorepo
- [ ] 5-2: Configure signed builds (GitHub Actions)
- [ ] 5-3: Implement folder watching
- [ ] 5-4: Set up auto-update
- [ ] 5-5: Set up Gumroad product and payment links
