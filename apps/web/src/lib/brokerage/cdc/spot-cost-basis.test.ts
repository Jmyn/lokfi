import { describe, expect, it } from 'vitest'
import type { BasisEvent } from './spot-cost-basis'
import { computeCostBasis, reconcile } from './spot-cost-basis'

function buy(quantity: number, price: number, fee = 0, timestamp = 1): BasisEvent {
  return { type: 'BUY', timestamp, quantity, price, fee }
}
function sell(quantity: number, price: number, fee = 0, timestamp = 2): BasisEvent {
  return { type: 'SELL', timestamp, quantity, price, fee }
}
function deposit(quantity: number, price: number | null, timestamp = 1): BasisEvent {
  return { type: 'DEPOSIT', timestamp, quantity, price }
}
function withdrawal(quantity: number, timestamp = 2): BasisEvent {
  return { type: 'WITHDRAWAL', timestamp, quantity, price: null }
}

describe('computeCostBasis — weighted average', () => {
  it('computes avgCost and realized P&L for buys then a partial sell', () => {
    const state = computeCostBasis([buy(1, 20_000, 0, 1), buy(1, 30_000, 0, 2), sell(1, 40_000, 0, 3)])
    expect(state.avgCost).toBe(25_000)
    expect(state.realizedPnl).toBe(15_000)
    expect(state.quantity).toBe(1)
    expect(state.totalCost).toBe(25_000)
    expect(state.basisQuality).toBe('ok')
  })

  it('includes buy fees in the basis', () => {
    const state = computeCostBasis([buy(1, 100, 1)])
    expect(state.totalCost).toBe(101)
    expect(state.avgCost).toBe(101)
  })

  it('subtracts sell fees from proceeds', () => {
    const state = computeCostBasis([buy(1, 100, 0, 1), sell(1, 150, 2, 2)])
    expect(state.realizedPnl).toBe(48)
    expect(state.quantity).toBe(0)
    expect(state.totalCost).toBe(0)
  })

  it('processes events in timestamp order regardless of input order', () => {
    const state = computeCostBasis([sell(1, 40_000, 0, 3), buy(2, 20_000, 0, 1)])
    expect(state.realizedPnl).toBe(20_000)
    expect(state.quantity).toBe(1)
    expect(state.basisQuality).toBe('ok')
  })

  it('returns a zeroed state for no events', () => {
    const state = computeCostBasis([])
    expect(state).toMatchObject({ quantity: 0, totalCost: 0, avgCost: 0, realizedPnl: 0, basisQuality: 'ok' })
  })
})

describe('computeCostBasis — deposits and withdrawals', () => {
  it('prices deposits at the supplied market price and flags estimated', () => {
    const state = computeCostBasis([deposit(2, 2_500)])
    expect(state.quantity).toBe(2)
    expect(state.totalCost).toBe(5_000)
    expect(state.basisQuality).toBe('estimated')
  })

  it('degrades to incomplete when the deposit price is unavailable', () => {
    const state = computeCostBasis([deposit(2, null)])
    expect(state.quantity).toBe(2)
    expect(state.totalCost).toBe(0)
    expect(state.basisQuality).toBe('incomplete')
    expect(state.diagnostics.some((d) => d.includes('zero cost'))).toBe(true)
  })

  it('reduces quantity and cost proportionally on withdrawal without realized P&L', () => {
    const state = computeCostBasis([buy(4, 100, 0, 1), withdrawal(1, 2)])
    expect(state.quantity).toBe(3)
    expect(state.totalCost).toBe(300)
    expect(state.avgCost).toBe(100)
    expect(state.realizedPnl).toBe(0)
    expect(state.basisQuality).toBe('ok')
  })

  it('mixes traded and deposited basis into one weighted average', () => {
    const state = computeCostBasis([buy(1, 100, 0, 1), deposit(1, 200, 2)])
    expect(state.quantity).toBe(2)
    expect(state.avgCost).toBe(150)
    expect(state.basisQuality).toBe('estimated')
  })
})

describe('computeCostBasis — history gaps', () => {
  it('clamps an oversell, flags incomplete, and keeps state sane', () => {
    const state = computeCostBasis([buy(1, 100, 0, 1), sell(2, 150, 0, 2)])
    expect(state.quantity).toBe(0)
    expect(state.totalCost).toBe(0)
    expect(state.realizedPnl).toBe(50)
    expect(state.basisQuality).toBe('incomplete')
    expect(state.diagnostics.some((d) => d.includes('history gap'))).toBe(true)
  })

  it('clamps an over-withdrawal and flags incomplete', () => {
    const state = computeCostBasis([buy(1, 100, 0, 1), withdrawal(5, 2)])
    expect(state.quantity).toBe(0)
    expect(state.basisQuality).toBe('incomplete')
  })
})

describe('reconcile', () => {
  it('adds missing quantity at the current market price and flags incomplete', () => {
    const state = computeCostBasis([buy(0.8, 50_000)])
    const reconciled = reconcile(state, 1.0, 60_000)
    expect(reconciled.quantity).toBe(1.0)
    expect(reconciled.totalCost).toBeCloseTo(0.8 * 50_000 + 0.2 * 60_000)
    expect(reconciled.basisQuality).toBe('incomplete')
    expect(reconciled.diagnostics.some((d) => d.includes('Reconciled'))).toBe(true)
  })

  it('adds missing quantity at zero cost when no price is available', () => {
    const state = computeCostBasis([buy(0.5, 100)])
    const reconciled = reconcile(state, 1.0, null)
    expect(reconciled.quantity).toBe(1.0)
    expect(reconciled.totalCost).toBe(50)
    expect(reconciled.basisQuality).toBe('incomplete')
  })

  it('removes excess quantity proportionally', () => {
    const state = computeCostBasis([buy(2, 100)])
    const reconciled = reconcile(state, 1, 500)
    expect(reconciled.quantity).toBe(1)
    expect(reconciled.totalCost).toBe(100)
    expect(reconciled.avgCost).toBe(100)
    expect(reconciled.basisQuality).toBe('incomplete')
  })

  it('ignores divergence within the 0.1% tolerance', () => {
    const state = computeCostBasis([buy(1.0, 100)])
    const reconciled = reconcile(state, 1.0005, 200)
    expect(reconciled).toBe(state)
    expect(reconciled.basisQuality).toBe('ok')
  })

  it('preserves realized P&L through reconciliation', () => {
    const state = computeCostBasis([buy(2, 100, 0, 1), sell(1, 150, 0, 2)])
    const reconciled = reconcile(state, 2, 200)
    expect(reconciled.realizedPnl).toBe(50)
  })
})
