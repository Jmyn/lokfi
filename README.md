# Lokfi — Privacy-First Finance Tracker 🇸🇬

> **"See where your money actually goes — without giving it to anyone."**

Lokfi is a local-first, privacy-first personal finance tracker. It allows you to parse bank statements or transaction history in PDF or CSV format entirely in your browser, categorize transactions with a powerful rule engine, and gain insights into your spending — all without a server, an account, or any cloud dependency.

## ✨ Features

- **100% Private**: Your data never leaves your device. All parsing and storage happen locally.
- **Bank Statement Parsing**: Support for major Singapore banks (see [Supported Banks](#-supported-banks) below).
- **CSV Transaction Parsing**: Support for CSV transaction history.
- **Rule Engine**: Automatically categorize transactions using matching rules.
- **Local-first Architecture**: Uses IndexedDB (via Dexie.js) for high-performance, asynchronous local storage.
- **Open Core**: The core parser library and web app are open-source and auditable.

## 🚀 Getting Started

### Web Application

The web app is a static React application. You can run it locally or deploy it to any static host.

```bash
pnpm install
pnpm dev
```

### Monorepo Structure

- `apps/web`: The main React 19 web application.
- `packages/parser-core`: Standalone library for parsing bank statements.
- `packages/parser-seed`: Dev utility for anonymizing statements for testing.

## 🛡️ Privacy Promise

Lokfi follows a "Zero Telemetry" policy. We do not track you, we do not use cookies, and we do not collect any data. The code is open-source specifically so you can verify this yourself.

## 🏦 Supported Banks

| Bank | Debit | Credit | Notes |
| ---- | ----- | ------ | ----- |
| OCBC | — | ✅ | support PDF credit/debit statements and CSV transaction history |
| Citibank | — | — | |
| UOB | — | — | |
| Crypto.com | ✅ | — | support CSV card transaction history |
| **DBS / POSB** | Planned | Planned | Phase 2 |
| Standard Chartered | Planned | Planned | Phase 4 |
| **Generic CSV** | ✅ | — | customizable in-app generic CSV parser |
| **Generic PDF** | — | — | Fallback for unsupported banks |

---

## 💡 Prefer CSV Over PDF

Where possible, export your transaction history as a **CSV** rather than downloading a **PDF** statement. Here's why:

| | CSV | PDF |
|---|---|---|
| **Data quality** | Clean, machine-readable text | Requires OCR — may introduce stray spaces or garbled characters |
| **Accuracy** | Perfect description matching for deduplication | Description may differ from CSV due to OCR artifacts |
| **Processing** | Faster (no OCR step) | Slower (text extracted via pdfjs-dist) |

**Duplicate detection caveat:** Lokfi deduplicates transactions using a hash of `(source, account, date, amount, description)`. If the same transaction appears in both a PDF and a CSV import and the OCR-normalized description differs from the CSV description, Lokfi will **not** detect it as a duplicate — both entries will be imported as separate transactions.

The best practice: pick one format per account and stick with it.

---

## 💰 Support the Project

Lokfi is a labor of love. If you find it useful, consider supporting:

- **GitHub Sponsors**: [Sponsor on GitHub](https://github.com/sponsors/jmyn)
- **Lokfi Desktop**: Buy the pre-built, signed desktop app for a one-time fee on [Gumroad](https://gumroad.com/l/lokfi). (Coming Soon)

## 📜 License

MIT © 2026 Jermyn Tanu (Jmyn)
