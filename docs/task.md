# Lokfi — Task Tracker

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

### 1C. Parser Implementation (skip PDF for now)

- [ ] 1C-1: Implement OCBC Credit parser
- [ ] 1C-2: Implement OCBC Debit parser
- [ ] 1C-3: Implement Citibank Credit parser
- [ ] 1C-4: Implement UOB Credit parser
- [x] 1C-5: Implement CDC Debit parser
  
### 1D. Database Layer (Dexie.js)

- [x] 1D-1: Implement Dexie database class
- [x] 1D-2: Implement default categories seed
- [x] 1D-3: Implement StorageManager persistence
- [x] 1D-4: Implement backup warning system

### 1E. PDF Parsing Pipeline (skip PDF for now)

- [ ] 1E-1: Create PDF Web Worker
- [ ] 1E-2: Create `usePdfWorker` hook
- [ ] 1E-3: Implement dedup + import pipeline

### 1F. Import Page UI

- [ ] 1F-1: Build drag-and-drop upload zone
- [ ] 1F-2: Build per-file status display
- [ ] 1F-3: Build import summary banner

## Phase 2 — Core Feature Polish

### 2A. Landing Page

- [ ] 2A-1: Build landing/onboarding page

### 2B. Transaction Table

- [ ] 2B-1: Build transaction table
- [ ] 2B-2: Implement table filters
- [ ] 2B-3: Implement bulk categorisation
- [ ] 2B-4: Implement empty state

### 2C. Rule Engine

- [ ] 2C-1: Implement rule evaluation function
- [ ] 2C-2: Build rule management page
- [ ] 2C-3: Build rule editor (modal)
- [ ] 2C-4: Apply rules on import
- [ ] 2C-5: Implement Rule Simulator

### 2D. Stats Page

- [ ] 2D-1: Build stats page with responsive charts

### 2E. Profile Page

- [ ] 2E-1: Build profile page

### 2F. New Bank Parsers

- [ ] 2F-1: Build DBS/POSB Credit parser
- [ ] 2F-2: Build DBS/POSB Debit parser
- [ ] 2F-3: Build UOB Debit parser

### 2G. Navigation & Layout

- [ ] 2G-1: Build app shell with sidebar navigation

## Phase 3 — Analytics & Insights

### 3A. Dashboard

- [ ] 3A-1: Build dashboard page with summary cards
- [ ] 3A-2: Add monthly trend line chart
- [ ] 3A-3: Add category pie/donut chart

### 3B. Advanced Analytics

- [ ] 3B-1: Top merchants view
- [ ] 3B-2: Category drilldown
- [ ] 3B-3: Export to CSV

### 3C. New Parsers

- [ ] 3C-1: Build Maybank Credit parser
- [ ] 3C-2: Build Maybank Debit parser

## Phase 4 — Desktop & Launch

### 4A. Tauri Wrapper

- [ ] 4A-1: Initialize Tauri in monorepo
- [ ] 4A-2: Implement folder watching
- [ ] 4A-3: Set up auto-update

### 4B. Launch Preparation

- [ ] 4B-1: Write README and documentation
- [ ] 4B-2: GitHub repo polish
- [ ] 4B-3: Landing page final copy and SEO
- [ ] 4B-4: Gumroad listing setup
