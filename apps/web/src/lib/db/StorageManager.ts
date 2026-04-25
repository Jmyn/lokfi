import { db } from './db'

export class StorageManager {
  /**
   * Attempts to request durable storage from the browser.
   * If successful, the browser is less likely to evict IndexedDB data under storage pressure.
   * Stores the outcome in the Lokfi settings table.
   */
  static async initPersistence(): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        const isPersisted = await navigator.storage.persisted()
        if (isPersisted) {
          await db.settings.put({ key: 'storagePermission', value: 'granted' })
          return
        }

        const granted = await navigator.storage.persist()
        await db.settings.put({ key: 'storagePermission', value: granted ? 'granted' : 'denied' })

        console.log(`[StorageManager] Persistence requested. Granted: ${granted}`)
      } catch (error) {
        console.error('[StorageManager] Failed to request storage persistence', error)
        await db.settings.put({ key: 'storagePermission', value: 'error' })
      }
    } else {
      console.warn('[StorageManager] Storage persistence API is not supported in this browser.')
    }
  }

  /**
   * Records that an export just happened, resetting the backup warning calendar.
   */
  static async recordExportEvent(): Promise<void> {
    const now = new Date().toISOString()
    await db.settings.put({ key: 'lastExportedAt', value: now })
  }
}
