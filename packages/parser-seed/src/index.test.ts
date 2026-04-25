import { describe, expect, it } from 'vitest'
import { fuzzAmount, redactAccountNo, redactName, shiftDate } from './index'

describe('Seed transformations', () => {
  it('redactAccountNo replaces middle segment with X', () => {
    expect(redactAccountNo('621-234567-001')).toBe('621-XXXXXX-001')
  })

  it('redactAccountNo works for different segment lengths', () => {
    expect(redactAccountNo('6215-12345678-001')).toBe('6215-XXXXXXXX-001')
  })

  it('redactName replaces non-space chars with *', () => {
    expect(redactName('John Doe')).toBe('**** ***')
  })

  it('shiftDate shifts forward correctly', () => {
    expect(shiftDate('2024-01-15', 5)).toBe('2024-01-20')
  })

  it('shiftDate handles month boundary', () => {
    expect(shiftDate('2024-01-28', 5)).toBe('2024-02-02')
  })

  it('fuzzAmount preserves sign and stays within 15%', () => {
    const result = fuzzAmount(100, 42)
    expect(Math.sign(result)).toBe(1)
    expect(Math.abs(result - 100) / 100).toBeLessThanOrEqual(0.15)
  })

  it('fuzzAmount is deterministic for same seed', () => {
    expect(fuzzAmount(100, 42)).toBe(fuzzAmount(100, 42))
  })
})
