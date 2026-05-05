# Transactions

The Transactions page is your central view of all imported financial activity. You can search, filter, categorize, and manage every transaction.

## Overview

All transactions from bank statements, CSV imports, and brokerage syncs appear in a single table. Each row shows:

| Column | Description |
|--------|-------------|
| Date | When the transaction occurred |
| Description | The transaction description from your statement |
| Amount | Debit (expense) or credit (income) |
| Category | Assigned category (or "Uncategorized") |
| Account | Source bank account or credit card |
| Source | Whether it came from a PDF, CSV, or brokerage sync |

## Filtering

Use the filter bar above the table to narrow down transactions:

- **Date range** — Filter by a specific period (month, quarter, custom range)
- **Category** — Show only transactions in one or more categories
- **Amount** — Min/max amount filters
- **Search** — Free-text search across descriptions
- **Source type** — Filter by PDF, CSV, or brokerage imports
- **Uncategorized** — Quickly find transactions that haven't been categorized yet

## Managing Transactions

### Change a Category

Click on a transaction's category badge to open the category picker. Select a new category to apply it immediately.

> Manual category changes are respected by the rule engine — Lokfi will never auto-override a category you've set by hand.

### Create a Rule from a Transaction

If you find yourself manually categorizing similar transactions repeatedly, create a rule:

1. Click the transaction's menu
2. Select **Create Rule**
3. The description pattern and category are pre-filled — adjust and save

This prevents uncategorized duplicates in future imports.

### Bulk Operations

Select multiple transactions using the checkboxes, then:

- **Assign Category** — Set the same category for all selected
- **Create Rule** — Create a rule matching all selected descriptions

## Duplicate Detection

Lokfi detects and skips duplicate transactions during import using a hash of `(source, account, date, amount, description)`. The source field varies by file type, so the same transaction from both a PDF and CSV may not be detected as a duplicate (descriptions often differ due to OCR artifacts in PDFs).

See [Importing Data → Duplicate Detection](./importing-data#duplicate-detection) for details.
