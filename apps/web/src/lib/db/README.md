# Database

## Code snippet to query indexedDB

In browser console, example to query unique rawTypes in `brokerageFundDetails` table

```javascript
const req = indexedDB.open('lokfi')
req.onsuccess = () => {
  const db = req.result
  const tx = db.transaction('brokerageFundDetails', 'readonly')
  const store = tx.objectStore('brokerageFundDetails')
  const all = store.getAll()
  all.onsuccess = () => {
    const rawTypes = [...new Set(all.result.map(fd => fd.rawType).filter(Boolean))]
    console.table(rawTypes.map(t => ({ rawType: t })))
    console.log(`Total records: ${all.result.length}, unique rawTypes: ${rawTypes.length}`)
  }
}
req.onerror = () => console.error('Failed to open IndexedDB')
```
