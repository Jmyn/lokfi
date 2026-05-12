import { describe, expect, it } from 'vitest'
import { computePortfolioTotalValue } from './usePortfolioSnapshot'
import type { BrokerageAccount, BrokeragePosition } from '@lokfi/brokerage-core'

const pos = (currency: string, marketValue: number): BrokeragePosition =>
  ({ currency, marketValue, quantity: 0, avgCost: 0 } as unknown as BrokeragePosition)

const acc = (currency: string, cashBalance: number): BrokerageAccount =>
  ({ currency, cashBalance } as unknown as BrokerageAccount)

const rates = { SGD: 1.35, USD: 1 }

describe('computePortfolioTotalValue', () => {
  it('sums position market values without conversion when Original', () => {
    const result = computePortfolioTotalValue(
      [pos('USD', 1000), pos('SGD', 500)],
      [],
      'Original',
      rates,
    )
    expect(result).toBeCloseTo(1500, 5)
  })

  it('converts positions and accounts to preferred currency', () => {
    // 1000 USD → 1350 SGD, 500 SGD stays 500 SGD, 200 USD cash → 270 SGD
    const result = computePortfolioTotalValue(
      [pos('USD', 1000), pos('SGD', 500)],
      [acc('USD', 200)],
      'SGD',
      rates,
    )
    expect(result).toBeCloseTo(1000 * 1.35 + 500 + 200 * 1.35, 2)
  })

  it('falls back to quantity * avgCost when marketValue is null', () => {
    const position = { currency: 'USD', marketValue: null, quantity: 10, avgCost: 50 } as unknown as BrokeragePosition
    const result = computePortfolioTotalValue([position], [], 'Original', null)
    expect(result).toBeCloseTo(500, 5)
  })

  it('returns 0 for empty positions and accounts', () => {
    expect(computePortfolioTotalValue([], [], 'SGD', rates)).toBe(0)
  })
})
