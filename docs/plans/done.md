# Lokfi — Changelog

> Completed milestones, newest first.

---

## 2026-03-21 — Dashboard + PDF Parsing

- **Dashboard (`/dashboard`)** shipped as replacement for `/stats`. Full widget suite: KPI row, monthly trend chart, category breakdown, category budget bars, savings rate gauge, average spending, spending heatmap, top merchants.
- **PDF parsing pipeline** via Web Worker (`pdf.worker.ts` + `usePdfWorker.ts`) using pdfjs-dist for non-blocking text extraction.
- **`OcbcCreditPdfParser`** — full OCBC credit card statement parser in `packages/parser-core/src/extractors/pdf/ocbc/`.
- **`GenericPdfParser`** — fallback PDF parser for unsupported banks.
- **`ocrNormalizer`** — cleans OCR artifacts (extra spaces, garbled chars) before parsing to improve description matching accuracy.
- **Magic rule suggestion engine** redesigned with smart extraction logic.
- **Import UI polish** — source labels, PDF vs CSV file handling, `accountNo` propagation per transaction.

---

## 2026-03 — Rule Engine + Copy-to-Clipboard

- Rule suggestion bar with live preview and toast confirmation.
- Copy-to-clipboard on rule descriptions.
- Category source indicators (manual vs rule-assigned).
- Redesigned rule suggestion engine with smart extraction.

---

## 2026-03 — Account Filtering + Inline Category Creation

- Account filter on transaction table.
- Inline category creation in category pickers.

---

## 2026-03 — Monorepo + Parser Foundation

- pnpm workspace + Turborepo monorepo scaffolded.
- `packages/parser-core` — standalone parser library.
- `packages/parser-seed` — dev CLI for anonymizing statements.
- `apps/web` — Vite + React 19 web app.
- `ParseError`, `generateTransactionHash`, `CdcDebitParser` (CSV), parser registry with auto-detect.
- Dexie.js database layer with persistence, backup warning banner.
- Drag-and-drop import page, transaction table with filters, bulk categorisation.
- Rule engine with evaluation, management page, editor modal, simulator, and apply-on-import.
- Landing page, app shell with sidebar navigation, profile page.
- Generic CSV parser with custom header fingerprinting.
- Budgets table on profile page, profile portability (JSON export/import).
