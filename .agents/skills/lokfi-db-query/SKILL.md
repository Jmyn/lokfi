---
name: lokfi-db-query
description: |
  Query the Lokfi IndexedDB database using the Chrome DevTools MCP in-browser.
  Provides the full schema, store/index listing, and reusable query patterns for
  transactions, rules, categories, brokerage data, and more.
  Auto-activate when user mentions: query database, check data, lokfi db,
  IndexedDB, what's in the database, show me records, how many transactions,
  find transactions, lokfi database, indexeddb lokfi, inspect db, peek at db
license: MIT
metadata:
  author: lokfi
  version: "0.1.0"
  language: en_US
---

# Lokfi DB Query — IndexedDB via Chrome DevTools MCP

Query the Lokfi Dexie.js IndexedDB database using `chrome-devtools_evaluate_script`
in the running app at `http://localhost:5173/`.

## Schema Overview

**Database:** `lokfi` (Dexie.js)

### Store: `transactions`
| Index | Key |
|-------|-----|
| Primary | `id` (UUID) |
| `hash` | dedup key |
| `source` | e.g. `"hsbc"` |
| `accountNo` | account number |
| `date` | ISO `YYYY-MM-DD` |
| `category` | category id (set by rules) |
| `manualCategory` | category id (set by user, overrides rules) |
| `importedAt` | ISO timestamp |

Fields: `id`, `hash`, `source`, `accountNo`, `date`, `description`, `transactionValue`, `balance?`, `category?`, `manualCategory?`, `importedAt`

### Store: `rules`
| Index | Key |
|-------|-----|
| Primary | `id` |
| `priority` | lower = applied first |
| `category` | category id |

Fields: `id`, `name`, `priority`, `conditions[]`, `category`, `createdAt`

### Store: `categories`
| Index | Key |
|-------|-----|
| Primary | `id` |
| `name` | category name |

Fields: `id`, `name`

### Store: `settings`
| Index | Key |
|-------|-----|
| Primary | `key` |

Fields: `key`, `value`

### Store: `budgets`
| Index | Key |
|-------|-----|
| Primary | `id` |
| `categoryId` | |

Fields: `id`, `categoryId`, `monthlyLimit`, `updatedAt`

### Store: `customParsers`
| Index | Key |
|-------|-----|
| Primary | `id` |
| `headerFingerprint` | |
| `name` | |
| `createdAt` | |

### Store: `fxRates`
| Index | Key |
|-------|-----|
| Primary | `[date+base]` |

Fields: `date`, `base`, `rates`

### Store: `brokeragePositions`
| Index | Key |
|-------|-----|
| Primary | `id` |

### Store: `brokeragePositionExtensions`
| Index | Key |
|-------|-----|
| Primary | `[positionId+key]` |
| `positionId` | |

### Store: `brokerageTransactions`
| Index | Key |
|-------|-----|
| Primary | `id` |
| `orderId` | |
| `source` | |
| `symbol` | |
| `executedAt` | |

### Store: `brokerageFundDetails`
| Index | Key |
|-------|-----|
| Primary | `id` |
| `source` | |
| `classifiedType` | |
| `symbol` | |
| `businessDate` | |

### Store: `brokerageAccounts`
| Index | Key |
|-------|-----|
| Primary | `id` |
| `source` | |
| `currency` | |

### Store: `brokerageSyncLog`
| Index | Key |
|-------|-----|
| Primary | `++id` (auto-increment) |
| `source` | |
| `category` | |
| `lastSyncAt` | |
| `status` | |

### Store: `brokerageCredentials`
| Index | Key |
|-------|-----|
| Primary | `id` |

## Query Method

Use `chrome-devtools_evaluate_script` with an `async () => { ... }` function.

**Pattern:**

```
async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('lokfi', <version>);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const tx = db.transaction('<storeName>', 'readonly');
  const store = tx.objectStore('<storeName>');
  const index = store.index('<indexName>'); // optional

  // ... query logic ...

  const results = await new Promise((resolve, reject) => {
    const req = <request>;
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  db.close();
  return results;
}
```

## When to Use Reference

| Task | Reference |
|------|-----------|
| Count/store summaries | [queries.md](references/queries.md) |
| Transactions by date range | [queries.md](references/queries.md) |
| Uncategorized transactions | [queries.md](references/queries.md) |
| Rules and their categories | [queries.md](references/queries.md) |
| Brokerage positions/accounts | [queries.md](references/queries.md) |
| Custom queries on any store | [queries.md](references/queries.md) |
