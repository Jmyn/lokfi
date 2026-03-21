# Lokfi — Roadmap

> High-level milestones, not a task list. Updated when priorities shift.

## Goal

A privacy-first personal finance tracker that works entirely offline — for Singapore bank customers who refuse to use cloud-based alternatives. Zero telemetry, zero account required. Parse statements, categorise transactions, understand spending.

---

## v1.0 — Core Import ✅

Parse any supported bank statement, categorise transactions, export your data.

**What's done:**

- PDF and CSV import pipeline (via Web Worker, non-blocking)
- Parser library: CDC CSV, Generic CSV, Generic PDF fallback
- OCBC Credit PDF parser with OCR text cleaning
- Rule engine: create, edit, simulate, apply on import
- Magic rule suggestion engine (auto-suggest rules from manual categorisations)
- Transaction table with filters, bulk categorise, account filtering
- Dashboard with KPI row, monthly trend, category breakdown, budget bars, savings rate, heatmap, top merchants
- Profile portability: export and import full data as JSON
- Dexie.js local database with persistence and backup warnings

---

## v1.1 — Multi-Bank Coverage (In Progress)

Support major Singapore banks so users aren't locked into one account type.

**Goal:** A user with any Singapore bank account can import and categorise in under 5 minutes.

**In progress:**

- OCBC Debit parser
- DBS / POSB parser (largest SG bank — highest priority)

**Next:**

- UOB Credit parser
- Citibank parser

**Triage:**

- Cross-format deduplication (PDF vs CSV — OCR description mismatch issue)

---

## v2.0 — Open Launch

Public repo, live landing page, announce to community.

Two-channel release: free hosted web app + paid desktop app.

**Goal:** Get it out and get feedback.

**Planned:**

- GitHub repository with issue templates, contribution guide
- Landing page on custom domain with SEO
- `.github/FUNDING.yml` and GitHub Sponsors
- User guide

---

## v2.x — Sustainablity and Monetisation

**Goal:** Make Lokfi sustainable and monetisable.

**Planned:**

- Gumroad listing for desktop app
- Desktop App

Native file watching, auto-updates, signed installers.

**Goal:** Non-technical users can run Lokfi like any other desktop app.

**Planned:**

- Tauri wrapper (Windows + macOS)
- Folder watching: auto-import new PDFs from Downloads
- Auto-update via Tauri updater
- Pre-built signed installers via GitHub Actions

---

## Future (Unscheduled)

These are unvalidated ideas that are out of scope for v1–v2:

- **P2P sync** — CRDT-based sync across devices via WebRTC, no central server
- **Mobile web app** — responsive layout for phone use
- **Budget alerts** — notify when spending exceeds a category budget
- **Multi-currency** — parse and convert foreign currency transactions
- **Investment tracking** — track investments across different platforms via BYO API key
- **AI categorisation and analytics** — use BYO AI to categorise transactions and provide insights
- **Webhooks** — receive webhooks from banks to automatically import transactions

---

*Last updated: March 2026*
