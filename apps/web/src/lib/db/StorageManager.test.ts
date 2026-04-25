import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StorageManager } from './StorageManager'
import { db } from './db'

// ─── Mocks ────────────────────────────────────────────────────────────────

vi.mock('./db', () => ({
  db: {
    settings: {
      put: vi.fn(),
    },
  },
}))

const mockPersist = vi.fn()
const mockPersisted = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('navigator', {
    storage: {
      persist: mockPersist,
      persisted: mockPersisted,
    },
  })
})

// ─── initPersistence ─────────────────────────────────────────────────────

describe('StorageManager.initPersistence()', () => {
  it('returns early when navigator.storage.persist is not available', async () => {
    vi.stubGlobal('navigator', { storage: undefined })
    await expect(StorageManager.initPersistence()).resolves.toBeUndefined()
    // No db.settings.put should be called
    expect(db.settings.put).not.toHaveBeenCalled()
  })

  it('sets permission to granted when already persisted', async () => {
    mockPersisted.mockResolvedValue(true)
    await StorageManager.initPersistence()
    expect(mockPersist).not.toHaveBeenCalled()
    expect(db.settings.put).toHaveBeenCalledWith({
      key: 'storagePermission',
      value: 'granted',
    })
  })

  it('requests persistence and stores granted=true when successful', async () => {
    mockPersisted.mockResolvedValue(false)
    mockPersist.mockResolvedValue(true)
    await StorageManager.initPersistence()
    expect(db.settings.put).toHaveBeenCalledWith({
      key: 'storagePermission',
      value: 'granted',
    })
  })

  it('requests persistence and stores granted=false when denied', async () => {
    mockPersisted.mockResolvedValue(false)
    mockPersist.mockResolvedValue(false)
    await StorageManager.initPersistence()
    expect(db.settings.put).toHaveBeenCalledWith({
      key: 'storagePermission',
      value: 'denied',
    })
  })

  it('stores error on exception', async () => {
    mockPersisted.mockRejectedValue(new Error('Storage API unavailable'))
    await StorageManager.initPersistence()
    expect(db.settings.put).toHaveBeenCalledWith({
      key: 'storagePermission',
      value: 'error',
    })
  })
})

// ─── recordExportEvent ───────────────────────────────────────────────────

describe('StorageManager.recordExportEvent()', () => {
  it('stores the current ISO timestamp as lastExportedAt', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-25T12:00:00.000Z'))

    await StorageManager.recordExportEvent()

    expect(db.settings.put).toHaveBeenCalledWith({
      key: 'lastExportedAt',
      value: '2026-03-25T12:00:00.000Z',
    })

    vi.useRealTimers()
  })
})
