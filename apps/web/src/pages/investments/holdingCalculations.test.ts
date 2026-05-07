import type { BrokerageFundDetail, BrokerageTransaction } from '@lokfi/brokerage-core'
import { describe, expect, it } from 'vitest'
import { computeStockSalePnL, getDividends } from './holdingCalculations'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tx(
  id: string,
  symbol: string,
  action: 'BUY' | 'SELL',
  qty: number,
  price: number,
  commission = 0
): BrokerageTransaction {
  return {
    id,
    source: 'test',
    orderId: id,
    symbol,
    action,
    quantity: qty,
    price,
    currency: 'USD',
    commission,
    executedAt: '2025-01-15T00:00:00Z',
  }
}

/** Negative amount = BUY, positive amount = SELL (mirrors real fund detail cash flow) */
function fundDetail(id: string, symbol: string, amount: number): BrokerageFundDetail {
  return {
    id,
    source: 'test',
    rawType: 'Trade',
    classifiedType: 'TRADE',
    symbol,
    amount,
    currency: 'USD',
    businessDate: '2025-01-15',
  }
}

// ---------------------------------------------------------------------------
// computeStockSalePnL
// ---------------------------------------------------------------------------

describe('computeStockSalePnL', () => {
  // ─── Scenario 1: Complete transaction history ──────────────────────────────
  it('computes P&L when all buys are tracked (totalBuyCost >= brokerCostBasisRemaining)', () => {
    // Position: 100 shares @ $50 → brokerCostBasisRemaining = $5,000
    // Transactions: $6,000 in buys, 1 sell of 20 @ $60 = $1,200
    const transactions: BrokerageTransaction[] = [
      tx('b1', 'AAPL', 'BUY', 50, 40), // $2,000
      tx('b2', 'AAPL', 'BUY', 50, 80), // $4,000
      tx('s1', 'AAPL', 'SELL', 20, 60), // $1,200
    ]

    const result = computeStockSalePnL('AAPL', 100, 50, transactions)

    expect(result.totalBuyCost).toBe(6000)
    expect(result.totalSellQty).toBe(20)
    expect(result.totalSellProceeds).toBe(1200)
    expect(result.costOfSoldShares).toBe(1000) // 6000 - 5000
    expect(result.realisedStockPnl).toBe(200) // 1200 - 1000
    expect(result.isIncomplete).toBe(false)
  })

  // ─── Scenario 2: Incomplete transactions + fund details fallback ──────────
  it('uses fund details as fallback when transaction history is incomplete', () => {
    // Position: 100 shares @ $50 → brokerCostBasisRemaining = $5,000
    // Transactions: $3,000 in buys (< $5,000 — incomplete)
    // Fund details: $8,000 in buys, $2,000 in sells — covers gap
    const transactions: BrokerageTransaction[] = [
      tx('b1', 'AAPL', 'BUY', 20, 50), // $1,000
      tx('b2', 'AAPL', 'BUY', 20, 100), // $2,000
      tx('s1', 'AAPL', 'SELL', 10, 55), // $550
    ]

    const fundDetails: BrokerageFundDetail[] = [
      fundDetail('fd1', 'AAPL', -5000), // buy $5,000
      fundDetail('fd2', 'AAPL', -3000), // buy $3,000
      fundDetail('fd3', 'AAPL', 2000), // sell $2,000
    ]

    const result = computeStockSalePnL('AAPL', 100, 50, transactions, fundDetails)

    // Fund details used exclusively — replaces both buy cost and sell proceeds
    expect(result.totalBuyCost).toBe(8000)
    expect(result.totalSellProceeds).toBe(2000)
    // totalSellQty still from transactions (not overwritten by fund details)
    expect(result.totalSellQty).toBe(10)
    expect(result.costOfSoldShares).toBe(3000) // 8000 - 5000
    expect(result.realisedStockPnl).toBe(-1000) // 2000 - 3000
    expect(result.isIncomplete).toBe(false)
  })

  // ─── Scenario 3: MSTY — no buy transactions, fund details cover everything ─
  it('uses fund details when no buy transactions exist (MSTY scenario)', () => {
    // Position: 200 shares @ $25 → brokerCostBasisRemaining = $5,000
    // Transactions: empty (all trades outside the 90-day lookback window)
    // Fund details: $8,000 in buys, $2,000 in sells — full history
    const transactions: BrokerageTransaction[] = []

    const fundDetails: BrokerageFundDetail[] = [
      fundDetail('fd1', 'MSTY', -3000), // buy $3,000
      fundDetail('fd2', 'MSTY', -5000), // buy $5,000
      fundDetail('fd3', 'MSTY', 2000), // sell $2,000
    ]

    const result = computeStockSalePnL('MSTY', 200, 25, transactions, fundDetails)

    expect(result.totalBuyCost).toBe(8000)
    expect(result.totalSellQty).toBe(0)
    expect(result.totalSellProceeds).toBe(2000)
    expect(result.costOfSoldShares).toBe(3000) // 8000 - 5000
    expect(result.realisedStockPnl).toBe(-1000) // 2000 - 3000
    expect(result.isIncomplete).toBe(false)
  })

  // ─── Scenario 4: MSTY with recent sells, no buys in window ────────────────
  it('uses fund details for both buys and sells when only sells are in transaction history', () => {
    // Position: 200 shares @ $25 → brokerCostBasisRemaining = $5,000
    // Transactions: 1 sell (recent), no buys (outside window)
    // Fund details: $8,000 in buys, $2,500 in sells (full history including recent)
    const transactions: BrokerageTransaction[] = [
      tx('s1', 'MSTY', 'SELL', 50, 30), // $1,500
    ]

    const fundDetails: BrokerageFundDetail[] = [
      fundDetail('fd1', 'MSTY', -3000), // buy $3,000
      fundDetail('fd2', 'MSTY', -5000), // buy $5,000
      fundDetail('fd3', 'MSTY', 2500), // sell $2,500
    ]

    const result = computeStockSalePnL('MSTY', 200, 25, transactions, fundDetails)

    // totalSellQty comes from transactions (not overwritten)
    expect(result.totalSellQty).toBe(50)
    // totalBuyCost and totalSellProceeds are overwritten by fund details
    expect(result.totalBuyCost).toBe(8000)
    expect(result.totalSellProceeds).toBe(2500)
    expect(result.costOfSoldShares).toBe(3000) // 8000 - 5000
    expect(result.realisedStockPnl).toBe(-500) // 2500 - 3000
    expect(result.isIncomplete).toBe(false)
  })

  // ─── Scenario 5: No fund details available ─────────────────────────────────
  it('returns incomplete when no fund details are provided and no transactions exist', () => {
    const transactions: BrokerageTransaction[] = []

    const result = computeStockSalePnL('AAPL', 100, 50, transactions)

    expect(result.totalBuyCost).toBe(0)
    expect(result.totalSellQty).toBe(0)
    expect(result.totalSellProceeds).toBe(0)
    expect(result.costOfSoldShares).toBe(0)
    expect(result.realisedStockPnl).toBe(0)
    expect(result.isIncomplete).toBe(true)
  })

  it('returns incomplete when no fund details provided but sells exist in transaction history', () => {
    // Sells exist but buys are missing (outside lookback)
    const transactions: BrokerageTransaction[] = [
      tx('s1', 'AAPL', 'SELL', 10, 60), // $600
    ]

    const result = computeStockSalePnL('AAPL', 100, 50, transactions)

    expect(result.totalBuyCost).toBe(0)
    expect(result.totalSellQty).toBe(10)
    expect(result.totalSellProceeds).toBe(600)
    expect(result.costOfSoldShares).toBe(0)
    expect(result.realisedStockPnl).toBe(0)
    expect(result.isIncomplete).toBe(true)
  })

  it('returns incomplete when fund details array is empty', () => {
    // Empty array is truthy — enters fund details branch but finds no TRADE records
    const transactions: BrokerageTransaction[] = []

    const result = computeStockSalePnL('AAPL', 100, 50, transactions, [])

    expect(result.totalBuyCost).toBe(0)
    expect(result.totalSellQty).toBe(0)
    expect(result.totalSellProceeds).toBe(0)
    expect(result.costOfSoldShares).toBe(0)
    expect(result.realisedStockPnl).toBe(0)
    expect(result.isIncomplete).toBe(true)
  })

  // ─── Scenario 6: Has option positions (fund details blocked) ──────────────
  it('returns incomplete when hasOptionPositions is true and transaction history is insufficient', () => {
    // Position: 50 shares @ $100 → brokerCostBasisRemaining = $5,000
    // Transactions: $3,000 in buys (< $5,000 — incomplete)
    // hasOptionPositions: true — fund details cannot be used to supplement
    const transactions: BrokerageTransaction[] = [
      tx('b1', 'AAPL', 'BUY', 20, 150), // $3,000
      tx('s1', 'AAPL', 'SELL', 10, 200), // $2,000
    ]

    const fundDetails: BrokerageFundDetail[] = [
      fundDetail('fd1', 'AAPL', -8000), // buy $8,000
    ]

    const result = computeStockSalePnL('AAPL', 50, 100, transactions, fundDetails, true)

    // Fund details blocked — falls to else branch
    expect(result.totalBuyCost).toBe(3000) // still from transactions
    expect(result.totalSellProceeds).toBe(2000) // still from transactions
    expect(result.totalSellQty).toBe(10)
    expect(result.costOfSoldShares).toBe(1000) // avgCost * totalSellQty = 100 * 10
    expect(result.realisedStockPnl).toBe(0)
    expect(result.isIncomplete).toBe(true)
  })

  // ─── Scenario 7: Fund details insufficient ─────────────────────────────────
  it('returns incomplete when fund details cannot cover the cost basis', () => {
    // Position: 100 shares @ $50 → brokerCostBasisRemaining = $5,000
    // Transactions: $2,000 in buys (< $5,000)
    // Fund details: $3,000 in buys (< $5,000)
    const transactions: BrokerageTransaction[] = [
      tx('b1', 'AAPL', 'BUY', 10, 200), // $2,000
    ]

    const fundDetails: BrokerageFundDetail[] = [
      fundDetail('fd1', 'AAPL', -3000), // buy $3,000 (insufficient)
    ]

    const result = computeStockSalePnL('AAPL', 100, 50, transactions, fundDetails)

    expect(result.totalBuyCost).toBe(2000)
    expect(result.totalSellQty).toBe(0)
    expect(result.totalSellProceeds).toBe(0)
    expect(result.costOfSoldShares).toBe(0)
    expect(result.realisedStockPnl).toBe(0)
    expect(result.isIncomplete).toBe(true)
  })

  // ─── Scenario 8: Transferred position with no history ─────────────────────
  it('handles transferred position with no history gracefully', () => {
    // Position: 50 shares @ $100 → brokerCostBasisRemaining = $5,000
    // No transactions, no fund details
    const transactions: BrokerageTransaction[] = []

    const result = computeStockSalePnL('AAPL', 50, 100, transactions)

    expect(result.totalBuyCost).toBe(0)
    expect(result.totalSellQty).toBe(0)
    expect(result.totalSellProceeds).toBe(0)
    expect(result.costOfSoldShares).toBe(0)
    expect(result.realisedStockPnl).toBe(0)
    expect(result.isIncomplete).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getDividends
// ---------------------------------------------------------------------------

function dividendFd(
  id: string,
  symbol: string,
  amount: number,
  type: 'DIVIDEND' | 'DIVIDEND_TAX',
  date = '2025-01-15'
): BrokerageFundDetail {
  return {
    id,
    source: 'test',
    rawType: type === 'DIVIDEND' ? 'Dividend' : 'Dividend Tax',
    classifiedType: type,
    symbol,
    amount,
    currency: 'USD',
    businessDate: date,
  }
}

describe('getDividends', () => {
  it('sums gross dividends and withholding tax correctly', () => {
    const fundDetails: BrokerageFundDetail[] = [
      dividendFd('d1', 'AAPL', 100, 'DIVIDEND'),
      dividendFd('d2', 'AAPL', 50, 'DIVIDEND'),
      dividendFd('d3', 'AAPL', -30, 'DIVIDEND_TAX'),
      dividendFd('d4', 'AAPL', -15, 'DIVIDEND_TAX'),
    ]

    expect(getDividends('AAPL', fundDetails)).toBe(105) // 100 + 50 - 30 - 15
  })

  it('caps tax reversals so they only cancel prior withholding, never become income', () => {
    // Simulates the MSTY scenario: $100 in gross dividends, $30 tax withheld,
    // then a $50 tax reversal (ROC reclassification).
    // Cumulative tax: -30 → +20 (capped at 0) → total = 100 + 0 = 100.
    const fundDetails: BrokerageFundDetail[] = [
      dividendFd('d1', 'MSTY', 100, 'DIVIDEND', '2025-01-15'),
      dividendFd('d2', 'MSTY', -30, 'DIVIDEND_TAX', '2025-01-17'),
      dividendFd('d3', 'MSTY', 50, 'DIVIDEND_TAX', '2025-03-15'), // reversal
    ]

    expect(getDividends('MSTY', fundDetails)).toBe(100) // capped, not 120
  })

  it('allows tax reversals to fully unwind prior tax but no more', () => {
    // $200 gross, $80 tax withheld, then $80 reversal (exact match)
    const fundDetails: BrokerageFundDetail[] = [
      dividendFd('d1', 'AAPL', 200, 'DIVIDEND', '2025-01-15'),
      dividendFd('d2', 'AAPL', -80, 'DIVIDEND_TAX', '2025-01-17'),
      dividendFd('d3', 'AAPL', 80, 'DIVIDEND_TAX', '2025-03-15'),
    ]

    expect(getDividends('AAPL', fundDetails)).toBe(200) // gross only, tax fully unwound
  })

  it('handles multiple interleaved taxes and reversals chronologically', () => {
    // Chronological: D1(+150), T1(-40), D2(+100), T2(-30), Rev(+60)
    // Cumulative tax: -40 → -70 → -10. Reversal absorbed within the deficit, never goes positive.
    // Total = gross(250) + cumTax(-10) = 240
    const fundDetails: BrokerageFundDetail[] = [
      dividendFd('d1', 'AAPL', 150, 'DIVIDEND', '2025-01-15'),
      dividendFd('t1', 'AAPL', -40, 'DIVIDEND_TAX', '2025-01-17'),
      dividendFd('d2', 'AAPL', 100, 'DIVIDEND', '2025-02-15'),
      dividendFd('t2', 'AAPL', -30, 'DIVIDEND_TAX', '2025-02-17'),
      dividendFd('rev1', 'AAPL', 60, 'DIVIDEND_TAX', '2025-03-15'),
    ]

    expect(getDividends('AAPL', fundDetails)).toBe(240) // 250 + (-10) = 240
  })

  it('returns only gross dividends when no tax records exist', () => {
    const fundDetails: BrokerageFundDetail[] = [
      dividendFd('d1', 'AAPL', 100, 'DIVIDEND'),
      dividendFd('d2', 'AAPL', 50, 'DIVIDEND'),
    ]

    expect(getDividends('AAPL', fundDetails)).toBe(150)
  })

  it('returns 0 when no dividend records exist', () => {
    expect(getDividends('AAPL', [])).toBe(0)
  })

  it('filters by symbol', () => {
    const fundDetails: BrokerageFundDetail[] = [
      dividendFd('d1', 'AAPL', 100, 'DIVIDEND'),
      dividendFd('d2', 'MSFT', 50, 'DIVIDEND'),
      dividendFd('d3', 'AAPL', -20, 'DIVIDEND_TAX'),
    ]

    expect(getDividends('AAPL', fundDetails)).toBe(80)
    expect(getDividends('MSFT', fundDetails)).toBe(50)
  })
})
