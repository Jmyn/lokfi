# Importing Data

Lokfi supports importing financial data from bank statements and brokerage accounts. All imports are processed locally in your browser.

## Bank Statements (PDF & CSV)

Navigate to the **Import** page from the sidebar.

### Supported Formats

| Format | Best for | Notes |
|--------|----------|-------|
| **CSV** | Transaction history exports | Clean machine-readable text, faster processing |
| **PDF** | Monthly bank statements | Text extracted via `pdfjs-dist`; may have OCR artifacts |

> **Tip:** Prefer CSV over PDF when available. CSV gives cleaner descriptions and faster processing. See [CSV vs PDF](../#prefer-csv-over-pdf) for details.

### How to Import

1. Go to **Import** in the sidebar
2. Drag and drop files onto the upload zone, or click to select files
3. Lokfi auto-detects the bank and parser — review the assignment if needed
4. Click **Import** to process

### Auto-Detection

Lokfi automatically detects which bank issued each statement using the file content. The detection runs parser-specific checks in order and picks the first match. You can override the parser assignment before importing.

### Duplicate Detection

Lokfi hashes each transaction by `(source, account, date, amount, description)` to detect duplicates. If you import the same statement twice, only the first import's transactions are kept.

**Important:** If the same transaction appears in both a PDF and a CSV (e.g., you imported both), the OCR-normalized description from the PDF may differ from the CSV description. In that case, they will **not** be detected as duplicates. Pick one format per account and stick with it.

## Brokerage Sync

Lokfi can sync portfolios and transactions from supported brokerages via API. Currently supported:

- **Tiger Brokers** — via OpenAPI

See the [Investments guide](./investments) for setup instructions.

## After Importing

Once your data is imported:

- Transactions appear in the [Transactions](../guide/transactions) page
- The [Finances Dashboard](../guide/finances) shows spending trends and breakdowns
- The [Rule Engine](../guide/categories-and-rules) auto-categorizes new transactions

## Troubleshooting

**"Parser not detected"** — The file format may not be supported yet. Check the [supported banks list](../reference/supported-banks) or try exporting CSV instead of PDF.

**"Import seems slow"** — PDF processing uses OCR and runs in a Web Worker. Large files take longer. CSV imports are much faster.
