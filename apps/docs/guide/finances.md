# Finances Dashboard

The Finances page gives you a visual overview of your spending, income, and financial trends — all computed locally from your transaction data.

## Dashboard Widgets

The dashboard is composed of modular widgets that can help you understand your money at a glance:

### Key Performance Indicators (KPI Row)

- **Total Spending** — Sum of all expenses in the selected period
- **Total Income** — Sum of all income in the selected period
- **Net Savings** — Income minus spending
- **Savings Rate** — Savings as a percentage of income

### Monthly Trend Chart

A line chart showing your income and spending trends over time. Hover over any point to see the breakdown for that month.

### Category Breakdown

A visual breakdown of spending by category — either as a bar chart or treemap. Quickly see which categories consume the largest share of your budget.

### Top Merchants

The most frequent merchants or payees in your transactions. Useful for spotting recurring expenses.

### Category Budget Bars

Compare spending against budget targets per category. Budgets help you stay on track.

### Spending Heatmap

A calendar heatmap showing spending intensity by day — similar to GitHub's contribution graph, but for your wallet.

### Average Income & Spending

Running averages computed over the selected date range.

## Period Selection

Use the period picker to change the view:

- **This Month** — Current month to date
- **Last Month** — Previous full month
- **Last 3 Months** — Rolling quarter
- **Last 12 Months** — Rolling year
- **Year to Date** — Since January 1st
- **Custom Range** — Pick any start and end date

## Currency

All amounts are displayed in your preferred currency. Lokfi supports:

- **SGD** — Singapore Dollar (default)
- **USD** — US Dollar
- **EUR** — Euro
- **MYR** — Malaysian Ringgit
- **IDR** — Indonesian Rupiah
- **THB** — Thai Baht
- **JPY** — Japanese Yen
- **CNY** — Chinese Yuan
- **HKD** — Hong Kong Dollar
- **GBP** — British Pound

> Exchange rates are fetched from the Frankfurter API (free, open-source) when available, with a fallback cache. All FX conversion happens locally.

## Filtering

The dashboard filters apply to all widgets simultaneously:

- **Date Range** — As described above
- **Account** — Filter to specific bank accounts
- **Category** — Include or exclude categories
- **Source Type** — Filter by PDF, CSV, or brokerage data

## Privacy Note

All charts, computations, and aggregations are generated locally in your browser. No financial data is ever sent to any server for processing or analytics.
