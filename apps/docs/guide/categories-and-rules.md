# Categories & Rules

Lokfi uses a **rule engine** to automatically categorize your transactions. This saves you from manually tagging every single expense or income entry.

## How Categorization Works

When transactions are imported, each one is classified through a priority chain:

```
Manual Override → General Rules (ascending priority) → Uncategorized
```

1. **Manual Override** — If you've manually set a category on a transaction, Lokfi never changes it. Your manual categories take absolute precedence.
2. **General Rules** — Rules you define match against transaction descriptions, amounts, and other fields. Rules with higher priority values override lower ones.
3. **Uncategorized** — If no rule matches and no manual override exists, the transaction remains uncategorized.

## Managing Rules

Go to the **Rules** page from the sidebar to view, create, edit, and delete rules.

### Rule Anatomy

Each rule consists of:

- **Pattern** — A string to match against the transaction description (case-insensitive)
- **Category** — The category to assign when matched
- **Priority** — A number. Higher priority rules override lower ones when multiple rules match the same transaction.

### Creating a Rule

1. Click **Add Rule**
2. Enter a **pattern** (e.g., "Grab" to match all Grab transactions)
3. Select the **category** to assign
4. Set the **priority** (default is fine for most cases)
5. Save

### Rule Suggestions

When viewing transactions, Lokfi may show suggestions to create rules based on uncategorized transactions you've manually categorized. These are one-click shortcuts to build out your rule set.

## Categories

Categories are organized hierarchically. The default set covers common expense and income categories:

- **Income** — Salary, Freelance, Investment Income, etc.
- **Housing** — Rent, Mortgage, Utilities, Maintenance
- **Food & Dining** — Groceries, Restaurants, Coffee Shops
- **Transport** — Public Transit, Ride Sharing, Fuel, Parking
- **Shopping** — Online, Retail, Subscriptions
- **Entertainment** — Streaming, Events, Games
- **Health** — Medical, Pharmacy, Fitness
- **Finance** — Banking Fees, Insurance, Taxes
- **Transfers** — Internal transfers between accounts

You can customize categories in the app settings.

## Bulk Categorization

From the Transactions page, you can:

- Select multiple transactions
- Assign a category to all selected at once
- Create a rule from the selection

## Best Practices

- **Start broad** — Create a few high-level rules first (e.g., "Grab" → Transport)
- **Add specificity later** — Refine with more specific patterns as needed
- **Review uncategorized** — Periodically check the Uncategorized filter to catch missed transactions
- **Let suggestions help** — Rule suggestions are a fast way to build out your ruleset
