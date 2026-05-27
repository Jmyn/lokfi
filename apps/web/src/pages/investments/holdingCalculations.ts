import type { BrokerageFundDetail, BrokeragePosition, BrokerageTransaction } from '@lokfi/brokerage-core'

/**
 * Extract the underlying stock ticker from an OCC option identifier.
 *
 * OCC format: "<SYMBOL>  <YYMMDD><C|P><strike>"
 * Example: "CRWV  260508P00106000" → "CRWV"
 */
export function extractUnderlying(identifier: string): string {
  const parts = identifier.split(/\s{2,}/)
  return parts[0] || ''
}

export interface HoldingMetrics {
  /** Total premium received from selling options on this underlying (lifetime) */
  totalOptionPremiums: number
  /** Net dividends received (gross - tax) for this stock (lifetime) */
  totalDividends: number
  /** Raw cost basis: quantity × avgCost */
  rawCostBasis: number
  /** Adjusted cost basis: rawCostBasis - premiums - dividends */
  adjustedCostBasis: number
  /** Adjusted cost basis per share, null if quantity ≤ 0 */
  adjCostBasisPerShare: number | null
  /** Market value of the position */
  marketValue: number
  /**
   * Total return % incorporating price return, option premiums, dividends,
   * and partial stock sale gains.
   *
   * Formula:
   *   ((marketValue + realisedPnl - rawCostBasisWithSales) / rawCostBasisWithSales) × 100
   *
   * Returns null when denominator ≤ 0.
   */
  totalReturnPct: number | null
  /** Realised gain/loss from partial stock sales only (excludes dividends and option premiums) */
  realisedStockPnl: number
  /** Total realised: stock sale gains + option premiums + dividends */
  realisedPnl: number
  /** Unrealised P&L on current position */
  unrealisedPnl: number
  /** Total P&L: realisedStockPnl + optionPremiums + dividends + unrealisedPnl */
  totalPnl: number
  /**
   * True when neither transaction history nor fund detail TRADE records fully
   * cover the broker's cost basis — the position may be incomplete due to
   * limited API history, a transferred position, or option-trade contamination
   * blocking the fund detail fallback.
   */
  isIncomplete: boolean
  /**
   * Diagnostic messages surfacing data quality concerns (e.g. transaction vs.
   * fund detail discrepancies, tax reversal impact, incomplete data sources).
   * Displayed in the expandable detail row.
   */
  diagnostics: string[]
}

/**
 * Compute option premiums received for a given stock symbol.
 *
 * Uses open short option positions (quantity < 0) where the option's underlying
 * matches the stock symbol. Tiger Broker uses the underlying ticker as the option
 * `symbol` field, so matching is direct.
 *
 * Premium = abs(quantity) × avgCost × multiplier
 *
 * Prefer `getOptionPremiumsFromTransactions` when secType-tagged transactions
 * are available — it captures closed/bought-back trades that positions miss.
 */
export function getOptionPremiums(stockSymbol: string, optionPositions: BrokeragePosition[]): number {
  return optionPositions
    .filter((p) => p.symbol === stockSymbol && p.secType === 'OPT' && p.quantity < 0)
    .reduce((sum, p) => sum + Math.abs(p.quantity) * p.avgCost * (p.multiplier ?? 100), 0)
}

/**
 * Compute option premiums from transaction records (order fills).
 *
 * Filters transactions by secType='OPT' for the given underlying symbol.
 * Handles both open (SELL to open) and closed (BUY to close) trades:
 *
 *   Net premium = Σ SELL × price × qty × multiplier − Σ BUY × price × qty × multiplier
 *
 * The multiplier defaults to 100 (standard US equity options) when no
 * matching open position exists to provide it.
 */
export function getOptionPremiumsFromTransactions(
  stockSymbol: string,
  transactions: BrokerageTransaction[],
  optionPositions: BrokeragePosition[]
): number {
  // Build a lookup of multiplier by symbol from open option positions
  const multiplierBySymbol = new Map<string, number>()
  for (const p of optionPositions) {
    if (p.secType === 'OPT' && p.multiplier) {
      multiplierBySymbol.set(p.symbol, p.multiplier)
    }
  }

  return transactions
    .filter((t) => t.symbol === stockSymbol && t.secType === 'OPT')
    .reduce((sum, t) => {
      const multiplier = multiplierBySymbol.get(t.symbol) ?? 100
      const premium = t.price * Math.abs(t.quantity) * multiplier
      return t.action === 'SELL' ? sum + premium : sum - premium
    }, 0)
}

/**
 * Compute total option premiums — prefers transaction-based (covers closed trades)
 * when secType-tagged data is available, falls back to open positions.
 */
export function getTotalOptionPremiums(
  stockSymbol: string,
  optionPositions: BrokeragePosition[],
  transactions?: BrokerageTransaction[]
): number {
  if (transactions?.some((t) => t.symbol === stockSymbol && t.secType === 'OPT')) {
    return getOptionPremiumsFromTransactions(stockSymbol, transactions, optionPositions)
  }
  return getOptionPremiums(stockSymbol, optionPositions)
}

export function computeDerivativeUnrealisedPnlPct(position: BrokeragePosition, unrealisedPnl?: number): number | null {
  if (position.unrealizedPnlPercent != null) return position.unrealizedPnlPercent * 100

  const multiplier = position.multiplier ?? 1
  const costBasis = Math.abs(position.quantity * position.avgCost * multiplier)
  if (costBasis <= 0) return null

  const pnl = unrealisedPnl ?? position.unrealizedPnl
  if (pnl == null) return null

  return (pnl / costBasis) * 100
}

/**
 * Compute realised P&L from partial stock sales.
 *
 * Uses the broker's authoritative cost basis (position.avgCost × position.qty) as
 * the anchor and reconciles via transaction cash flows. This is immune to
 * corporate actions (splits, reverse splits, mergers) because it works with
 * total dollar amounts, not per-share quantities that drift after adjustments.
 *
 *   costOfSoldShares   = totalBuyCost − brokerCostBasisRemaining
 *   realisedStockPnl   = totalSellProceeds − costOfSoldShares
 *
 * where brokerCostBasisRemaining = position.avgCost × position.qty.
 *
 * Data source priority:
 *   1. Transaction history (brokerageTransactions) — has per-share detail and
 *      covers the full account history when available. The sync fetches up to
 *      10 years of history (3650 days) in 90-day API-call chunks.
 *   2. Fund detail TRADE records (brokerageFundDetails) — cash ledger entries
 *      that accumulate across syncs. Used as the fallback when transaction
 *      history is incomplete or not available from the broker API.
 *
 * For symbols with option positions, fund details can't separate stock from
 * option trades — in that case only premiums + dividends are shown as realised.
 *
 * Known limitation: return-of-capital distributions (reported as dividend by
 * the broker but reducing cost basis) are not tracked separately and can cause
 * costOfSoldShares to be overstated.
 */
export function computeStockSalePnL(
  symbol: string,
  currentQty: number,
  currentAvgCost: number,
  transactions: BrokerageTransaction[],
  fundDetails?: BrokerageFundDetail[],
  hasOptionPositions?: boolean
): {
  totalBuyCost: number
  totalSellQty: number
  totalSellProceeds: number
  costOfSoldShares: number
  realisedStockPnl: number
  isIncomplete: boolean
} {
  const stockTxns = transactions.filter((t) => t.symbol === symbol && (t.secType === 'STK' || t.secType == null))

  let totalBuyCost = 0
  let totalSellQty = 0
  let totalSellProceeds = 0

  for (const t of stockTxns) {
    const amount = t.price * Math.abs(t.quantity)
    const comm = t.commission ?? 0
    if (t.action === 'BUY') {
      totalBuyCost += amount + comm
    } else {
      totalSellQty += Math.abs(t.quantity)
      totalSellProceeds += amount - comm
    }
  }

  const brokerCostBasisRemaining = currentAvgCost * currentQty
  let isIncomplete = false

  let costOfSoldShares: number
  if (totalBuyCost > 0 && totalBuyCost >= brokerCostBasisRemaining) {
    // Complete: all buys are tracked in transaction history
    costOfSoldShares = totalBuyCost - brokerCostBasisRemaining
  } else if (fundDetails && !hasOptionPositions) {
    // Transaction history is incomplete or missing — use fund detail TRADE
    // records as the fallback source. Fund details accumulate across syncs
    // and cover the full account history.
    // Only safe for symbols without option positions (fund details can't
    // separate stock from option trades).
    let fdBuyCost = 0
    let fdSellProceeds = 0
    for (const fd of fundDetails) {
      if (fd.classifiedType !== 'TRADE' || fd.symbol !== symbol) continue
      // Fund detail amounts are total dollars: negative = BUY, positive = SELL
      fdBuyCost += fd.amount < 0 ? Math.abs(fd.amount) : 0
      fdSellProceeds += fd.amount > 0 ? fd.amount : 0
    }

    if (fdBuyCost >= brokerCostBasisRemaining) {
      // Fund details cover the full buy history — use them exclusively to
      // avoid double-counting with transaction data (same trades appear in both)
      totalBuyCost = fdBuyCost
      totalSellProceeds = fdSellProceeds
      costOfSoldShares = totalBuyCost - brokerCostBasisRemaining
    } else if (fdBuyCost > 0) {
      // Fund details exist but can't cover current cost basis
      // (position may have been transferred or cost basis adjusted by corp actions)
      isIncomplete = true
      costOfSoldShares = 0
    } else {
      // No fund detail TRADE records for this symbol at all
      isIncomplete = true
      costOfSoldShares = 0
    }
  } else if (totalBuyCost === 0 && totalSellProceeds > 0) {
    // No buy transactions at all but sells exist — definitely incomplete
    // (and no fund details available, or has option positions blocking fallback)
    isIncomplete = true
    costOfSoldShares = 0
  } else {
    // Incomplete: some tracked buys but not enough to cover the broker's
    // cost basis, and option positions blocked the fund detail fallback.
    isIncomplete = true
    costOfSoldShares = currentAvgCost * totalSellQty
  }

  const realisedStockPnl = isIncomplete ? 0 : totalSellProceeds - costOfSoldShares

  return { totalBuyCost, totalSellQty, totalSellProceeds, costOfSoldShares, realisedStockPnl, isIncomplete }
}

/**
 * Compute net dividends received (gross dividend - withholding tax) for a stock.
 *
 * Sums across ALL time (lifetime cumulative), since cost basis adjustment is
 * cumulative. Negative tax records are withholding; positive tax records are
 * reversals (e.g. from return-of-capital reclassification).
 *
 * Tax reversals are capped so they only cancel prior withholding — they never
 * inflate the net dividend beyond gross. Otherwise a ROC reclassification
 * reversing $14k of tax would incorrectly appear as $14k of additional income.
 */
export function getDividends(stockSymbol: string, fundDetails: BrokerageFundDetail[]): number {
  const grossDividends = fundDetails
    .filter((fd) => fd.symbol === stockSymbol && fd.classifiedType === 'DIVIDEND')
    .reduce((sum, fd) => sum + fd.amount, 0)

  // Track cumulative tax paid (negative = tax withheld). Floor at 0 so that
  // reversal entries (positive) can only unwind prior withholding, never
  // create a net credit that would inflate the dividend total.
  let cumulativeTax = 0
  const taxEntries = fundDetails
    .filter((fd) => fd.symbol === stockSymbol && fd.classifiedType === 'DIVIDEND_TAX')
    .sort((a, b) => a.businessDate.localeCompare(b.businessDate))

  for (const fd of taxEntries) {
    cumulativeTax += fd.amount
    // Cap at 0 — withholding tax can't become a net credit
    if (cumulativeTax > 0) cumulativeTax = 0
  }

  return grossDividends + cumulativeTax
}

/**
 * Compute all holding metrics for a single stock position.
 *
 * Incorporates:
 *   - Partial stock sale gains (average cost accounting from transaction history)
 *   - Option premiums (from transactions or open positions)
 *   - Dividends (from fund details)
 *   - Unrealised P&L (from broker or computed)
 *
 * Adjusted Cost Basis = Raw Cost Basis − Option Premiums Received − Net Dividends
 *
 * Total Return % = (Market Value + Realised P&L − RawCostBasisWithSales) / RawCostBasisWithSales × 100
 *   where RawCostBasisWithSales accounts for the reduced cost basis after partial sales.
 */
export function getAdjustedMetrics(
  position: BrokeragePosition,
  optionPositions: BrokeragePosition[],
  fundDetails: BrokerageFundDetail[],
  transactions?: BrokerageTransaction[]
): HoldingMetrics {
  const rawCostBasis = position.quantity * position.avgCost
  const marketValue = position.marketValue ?? position.quantity * position.avgCost
  const totalOptionPremiums = getTotalOptionPremiums(position.symbol, optionPositions, transactions)
  const totalDividends = getDividends(position.symbol, fundDetails)
  const adjustedCostBasis = rawCostBasis - totalOptionPremiums - totalDividends

  const adjCostBasisPerShare = position.quantity > 0 ? adjustedCostBasis / position.quantity : null

  // Unrealised P&L: use broker's figure when available, otherwise compute
  const unrealisedPnl = position.unrealizedPnl ?? marketValue - adjustedCostBasis

  // Realised stock P&L via broker cost basis reconciliation.
  // Fund details supplement transaction data for full buy/sell history.
  const hasOptionPositions = optionPositions.some(
    (p) => p.symbol === position.symbol && p.secType === 'OPT' && p.quantity < 0
  )
  const stockPnL = transactions
    ? computeStockSalePnL(
        position.symbol,
        position.quantity,
        position.avgCost,
        transactions,
        fundDetails,
        hasOptionPositions
      )
    : {
        totalBuyCost: 0,
        totalSellQty: 0,
        totalSellProceeds: 0,
        costOfSoldShares: 0,
        realisedStockPnl: 0,
        isIncomplete: false,
      }

  const realisedPnl = stockPnL.realisedStockPnl + totalOptionPremiums + totalDividends

  const totalPnl = realisedPnl + unrealisedPnl

  // Total return denominator: cost basis of remaining shares (broker's figure,
  // already adjusted for splits/mergers)
  const investedCost = position.avgCost * position.quantity
  const totalReturnPct = investedCost > 0 ? ((marketValue + realisedPnl - investedCost) / investedCost) * 100 : null

  // ── Diagnostics ──────────────────────────────────────────────────────────
  const diagnostics: string[] = []

  // Tax reversal impact: detect positive DIVIDEND_TAX entries (reversals)
  const taxReversals = fundDetails.filter(
    (fd) => fd.symbol === position.symbol && fd.classifiedType === 'DIVIDEND_TAX' && fd.amount > 0
  )
  if (taxReversals.length > 0) {
    const reversalSum = taxReversals.reduce((s, fd) => s + fd.amount, 0)
    if (reversalSum > 0) {
      diagnostics.push(
        `${taxReversals.length} tax reversal entries (${formatCurrencyLocal(reversalSum, position.currency)}) detected — likely ROC reclassification. Net dividend capped at gross; excess reversals excluded.`
      )
    }
  }

  // Source discrepancy: when both transactions and fund details exist,
  // check if they produce materially different stock sale P&L
  if (transactions && transactions.length > 0 && !hasOptionPositions && !stockPnL.isIncomplete) {
    const stockTxns = transactions.filter(
      (t) => t.symbol === position.symbol && (t.secType === 'STK' || t.secType == null)
    )
    if (stockTxns.length > 0) {
      let fdBuyCost = 0
      let fdSellProceeds = 0
      for (const fd of fundDetails) {
        if (fd.classifiedType !== 'TRADE' || fd.symbol !== position.symbol) continue
        fdBuyCost += fd.amount < 0 ? Math.abs(fd.amount) : 0
        fdSellProceeds += fd.amount > 0 ? fd.amount : 0
      }
      if (fdBuyCost > 0) {
        const fdCostOfSold = fdBuyCost - investedCost
        const fdRealised = fdSellProceeds - fdCostOfSold
        const diff = Math.abs(stockPnL.realisedStockPnl - fdRealised)
        if (diff > 0.01 && fdBuyCost >= investedCost) {
          diagnostics.push(
            `Stock P&L source: transactions (${formatCurrencyLocal(stockPnL.realisedStockPnl, position.currency)}). Fund detail estimate would be ${formatCurrencyLocal(fdRealised, position.currency)} (diff: ${formatCurrencyLocal(diff, position.currency)}).`
          )
        }
      }
    }
  } else if (stockPnL.isIncomplete && stockPnL.totalSellProceeds > 0) {
    diagnostics.push(
      'Realised stock P&L is incomplete — buy history does not cover sold shares. Extend sync lookback for full history.'
    )
  } else if (
    stockPnL.isIncomplete &&
    stockPnL.totalSellProceeds === 0 &&
    transactions &&
    stockTxns_count(transactions, position.symbol) > 0
  ) {
    diagnostics.push(
      'Buy history is incomplete — tracked purchases do not cover current position quantity. May indicate a transferred position or missing historical data.'
    )
  } else if (!transactions || stockTxns_count(transactions, position.symbol) === 0) {
    diagnostics.push('Stock P&L sourced from fund detail TRADE records (no transaction history available).')
  }

  return {
    totalOptionPremiums,
    totalDividends,
    rawCostBasis,
    adjustedCostBasis,
    adjCostBasisPerShare,
    marketValue,
    totalReturnPct,
    realisedStockPnl: stockPnL.realisedStockPnl,
    realisedPnl,
    unrealisedPnl,
    totalPnl,
    isIncomplete: stockPnL.isIncomplete,
    diagnostics,
  }
}

function formatCurrencyLocal(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function stockTxns_count(transactions: BrokerageTransaction[], symbol: string): number {
  return transactions.filter((t) => t.symbol === symbol && (t.secType === 'STK' || t.secType == null)).length
}
