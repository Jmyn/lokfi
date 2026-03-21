# Lokfi — Roadmap

> High-level milestones, not a task list. Updated when priorities shift.

## Goal

A privacy-first personal finance tracker that works entirely offline — for Singapore bank customers who refuse to use cloud-based alternatives. Zero telemetry, zero account required. Parse statements, categorise transactions, understand spending.

## Two-Channel Strategy

Lokfi is available in two forms — same codebase, different delivery:

| | Web App (free) | Desktop App (paid) |
|---|---|---|
| **Where** | `app.lokfi.com` | Downloads from Gumroad |
| **Updates** | Instant | User downloads new version |
| **File watching** | — | Auto-import from Downloads |
| **Offline** | Requires browser tab open | Full offline |
| **Privacy** | All data local | All data local |

The web app is the **try-it channel** — zero friction for curious users. The desktop app is the **full product** for privacy-conscious and power users.

---

## v1.0 — Core Import ✅ Shipped

Parse any supported bank statement, categorise transactions, export your data.

**What shipped:**

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

Support all major Singapore banks so users aren't locked into one account type.

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

## v1.2 — Smart Rules (Next)

Rule engine that reduces manual categorisation to near-zero work.

**Goal:** After importing a month of statements, most transactions are already correctly categorised.

**Planned:**

- Rule priority drag-to-reorder UI
- Rule simulator: paste a description, see which rule matches
- Improved suggestion algorithm (higher match accuracy, fewer false positives)

---

## v2.0 — Open Launch

Two-channel release: free hosted web app + paid desktop app.
Public GitHub repo for community contributions.

**Web app (free):**

- Deploy Vite build to static site host
- Custom domain: `app.lokfi.com` or `/app` path

**Desktop app (paid, $15):**

- GitHub repository with issue templates and contribution guide
- Gumroad listing setup

**Shared:**

- Landing page at `lokfi.com` — explains what Lokfi is, product screenshots, "Try free" vs "Get desktop app" CTAs
- SEO, custom domain registration
- `.github/FUNDING.yml` + GitHub Sponsors page

---

## v2.x — Desktop App (Post-Launch)

Native file watching, auto-updates, signed installers.

**Goal:** Non-technical users can run Lokfi like any other desktop app.

**Planned:**

- Tauri wrapper (Windows + macOS)
- Folder watching: auto-import new PDFs from Downloads
- Auto-update via Tauri updater
- Pre-built signed installers via GitHub Actions

---

## Future (Unscheduled)

These are validated ideas that are out of scope for v1–v2:

- **P2P sync** — CRDT-based sync across devices via WebRTC, no central server
- **Mobile web app** — responsive layout for phone use
- **Budget alerts** — notify when spending exceeds a category budget
- **Multi-currency** — parse and convert foreign currency transactions

---

*Last updated: March 2026*
