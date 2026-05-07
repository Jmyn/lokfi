# Lokfi DB Query Reference — Common Query Patterns

All queries use `chrome-devtools_evaluate_script`. Just copy the function body
into the `function` parameter.

## Getting the Current DB Version

```javascript
async () => {
  const dbs = await window.indexedDB.databases();
  return dbs;
}
```

## Record Counts for All Stores

```javascript
async () => {
  const dbs = await window.indexedDB.databases();
  const results = [];
  for (const info of dbs) {
    const db = await new Promise((r, x) => {
      const q = indexedDB.open(info.name, info.version);
      q.onsuccess = () => r(q.result);
      q.onerror = () => x(q.error);
    });
    const stores = [];
    for (const name of db.objectStoreNames) {
      const tx = db.transaction(name, 'readonly');
      const count = await new Promise((r, x) => {
        const q = tx.objectStore(name).count();
        q.onsuccess = () => r(q.result);
        q.onerror = () => x(q.error);
      });
      stores.push({ name, count });
    }
    results.push({ name: info.name, stores });
    db.close();
  }
  return results;
}
```

## All Transactions (with date ordering)

```javascript
async () => {
  const db = await new Promise((r, x) => {
    const q = indexedDB.open('lokfi', 70);
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  const tx = db.transaction('transactions', 'readonly');
  const store = tx.objectStore('transactions');
  const all = await new Promise((r, x) => {
    const q = store.getAll();
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  db.close();
  return all.sort((a, b) => a.date.localeCompare(b.date));
}
```

## Transactions by Date Range

```javascript
async () => {
  const db = await new Promise((r, x) => {
    const q = indexedDB.open('lokfi', 70);
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  const tx = db.transaction('transactions', 'readonly');
  const index = tx.objectStore('transactions').index('date');
  const range = IDBKeyRange.bound('2025-01-01', '2025-12-31');
  const results = await new Promise((r, x) => {
    const q = index.getAll(range);
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  db.close();
  return results;
}
```

## Uncategorized Transactions (no category set)

```javascript
async () => {
  const db = await new Promise((r, x) => {
    const q = indexedDB.open('lokfi', 70);
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  const tx = db.transaction('transactions', 'readonly');
  const store = tx.objectStore('transactions');
  const all = await new Promise((r, x) => {
    const q = store.getAll();
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  db.close();
  return all.filter(t => !t.category && !t.manualCategory);
}
```

## Manually Categorized Transactions

```javascript
async () => {
  const db = await new Promise((r, x) => {
    const q = indexedDB.open('lokfi', 70);
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  const tx = db.transaction('transactions', 'readonly');
  const index = tx.objectStore('transactions').index('manualCategory');
  const result = await new Promise((r, x) => {
    const q = index.getAll();
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  db.close();
  return result;
}
```

## Transactions by Source (e.g. `"hsbc"`)

```javascript
async () => {
  const db = await new Promise((r, x) => {
    const q = indexedDB.open('lokfi', 70);
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  const tx = db.transaction('transactions', 'readonly');
  const index = tx.objectStore('transactions').index('source');
  const results = await new Promise((r, x) => {
    const q = index.getAll('hsbc');
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  db.close();
  return results;
}
```

## All Rules Ordered by Priority

```javascript
async () => {
  const db = await new Promise((r, x) => {
    const q = indexedDB.open('lokfi', 70);
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  const tx = db.transaction('rules', 'readonly');
  const index = tx.objectStore('rules').index('priority');
  const rules = await new Promise((r, x) => {
    const q = index.getAll();
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  db.close();
  return rules;
}
```

## Rules for a Specific Category

```javascript
async () => {
  const db = await new Promise((r, x) => {
    const q = indexedDB.open('lokfi', 70);
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  const tx = db.transaction('rules', 'readonly');
  const index = tx.objectStore('rules').index('category');
  const rules = await new Promise((r, x) => {
    const q = index.getAll('<category-id>');
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  db.close();
  return rules;
}
```

## All Categories

```javascript
async () => {
  const db = await new Promise((r, x) => {
    const q = indexedDB.open('lokfi', 70);
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  const tx = db.transaction('categories', 'readonly');
  const store = tx.objectStore('categories');
  const all = await new Promise((r, x) => {
    const q = store.getAll();
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  db.close();
  return all;
}
```

## Budgets with Category Details (cross-store lookup)

```javascript
async () => {
  const db = await new Promise((r, x) => {
    const q = indexedDB.open('lokfi', 70);
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  const budgets = await new Promise((r, x) => {
    const q = db.transaction('budgets', 'readonly').objectStore('budgets').getAll();
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  const categories = await new Promise((r, x) => {
    const q = db.transaction('categories', 'readonly').objectStore('categories').getAll();
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  db.close();
  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
  return budgets.map(b => ({ ...b, categoryName: catMap[b.categoryId] || 'Unknown' }));
}
```

## All Brokerage Accounts

```javascript
async () => {
  const db = await new Promise((r, x) => {
    const q = indexedDB.open('lokfi', 70);
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  const tx = db.transaction('brokerageAccounts', 'readonly');
  const store = tx.objectStore('brokerageAccounts');
  const all = await new Promise((r, x) => {
    const q = store.getAll();
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  db.close();
  return all;
}
```

## Brokerage Positions by Account

```javascript
async () => {
  const db = await new Promise((r, x) => {
    const q = indexedDB.open('lokfi', 70);
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  const tx = db.transaction('brokeragePositions', 'readonly');
  const store = tx.objectStore('brokeragePositions');
  const all = await new Promise((r, x) => {
    const q = store.getAll();
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  db.close();
  return all;
}
```

## Brokerage Fund Details by Source

```javascript
async () => {
  const db = await new Promise((r, x) => {
    const q = indexedDB.open('lokfi', 70);
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  const tx = db.transaction('brokerageFundDetails', 'readonly');
  const index = tx.objectStore('brokerageFundDetails').index('source');
  const results = await new Promise((r, x) => {
    const q = index.getAll('tiger');
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  db.close();
  return results;
}
```

## Brokerage Sync Log (recent entries)

```javascript
async () => {
  const db = await new Promise((r, x) => {
    const q = indexedDB.open('lokfi', 70);
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  const tx = db.transaction('brokerageSyncLog', 'readonly');
  const store = tx.objectStore('brokerageSyncLog');
  const all = await new Promise((r, x) => {
    const q = store.getAll();
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  db.close();
  return all.sort((a, b) => (b.lastSyncAt || '').localeCompare(a.lastSyncAt || ''));
}
```

## Custom Query — Any Store, Any Index

Generic pattern to query any store with any index:

```javascript
async () => {
  const db = await new Promise((r, x) => {
    const q = indexedDB.open('lokfi', 70);
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  const tx = db.transaction('<storeName>', 'readonly');
  const src = '<indexName>'
    ? tx.objectStore('<storeName>').index('<indexName>')
    : tx.objectStore('<storeName>');
  const range = '<keyValue>'
    ? IDBKeyRange.only('<keyValue>')
    : null;
  const results = await new Promise((r, x) => {
    const q = range ? src.getAll(range) : src.getAll();
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  db.close();
  return results;
}
```

## Transaction Summary by Category (aggregation)

```javascript
async () => {
  const db = await new Promise((r, x) => {
    const q = indexedDB.open('lokfi', 70);
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  const tx = db.transaction('transactions', 'readonly');
  const all = await new Promise((r, x) => {
    const q = tx.objectStore('transactions').getAll();
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  const cats = await new Promise((r, x) => {
    const q = db.transaction('categories', 'readonly').objectStore('categories').getAll();
    q.onsuccess = () => r(q.result);
    q.onerror = () => x(q.error);
  });
  db.close();
  const catMap = Object.fromEntries(cats.map(c => [c.id, c.name]));
  const summary = {};
  for (const t of all) {
    const catId = t.manualCategory || t.category || '__uncategorized__';
    const catName = catMap[catId] || 'Uncategorized';
    if (!summary[catName]) summary[catName] = { count: 0, total: 0 };
    summary[catName].count++;
    summary[catName].total += t.transactionValue;
  }
  return summary;
}
```
