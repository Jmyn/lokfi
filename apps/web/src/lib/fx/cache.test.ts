import { describe, expect, it } from 'vitest'
import { isStale } from './cache'

describe('isStale', () => {
  it('returns false for today', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(isStale(today)).toBe(false)
  })

  it('returns true for yesterday', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    expect(isStale(yesterday)).toBe(true)
  })
})
