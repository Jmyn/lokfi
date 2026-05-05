import { describe, expect, it } from 'vitest'
import { convertAmount } from './convert'

describe('convertAmount', () => {
  const rates = { SGD: 1.35, HKD: 7.82, USD: 1 }

  it('converts USD to SGD', () => {
    expect(convertAmount(100, 'USD', 'SGD', rates)).toBeCloseTo(135, 2)
  })

  it('converts SGD to HKD via USD base', () => {
    expect(convertAmount(100, 'SGD', 'HKD', rates)).toBeCloseTo((100 / 1.35) * 7.82, 2)
  })

  it('returns same amount when converting to same currency', () => {
    expect(convertAmount(100, 'USD', 'USD', rates)).toBe(100)
  })

  it('returns original amount when rate is missing', () => {
    expect(convertAmount(100, 'USD', 'XYZ', rates)).toBe(100)
  })
})
