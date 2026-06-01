/**
 * 9 SIG TQQQ Strategy — SMA timing signal computation engine.
 *
 * Evaluates 9 SMA cross-over pairs on QQQ daily closes at month-end.
 * A score of ≥5 bullish signals means hold TQQQ; <5 means switch to SGOV.
 *
 * Signals are read from QQQ (the underlying Nasdaq-100 ETF), not TQQQ.
 * Positions: binary — 100% TQQQ or 100% SGOV.
 */

// ── SMA periods (trading days) ─────────────────────────────────────────────

export const SMA_PERIODS = [21, 42, 63, 126, 189, 252] as const
export type SmaPeriod = (typeof SMA_PERIODS)[number]

// ── Signal pair definitions ────────────────────────────────────────────────

export interface SignalPairDef {
  id: number
  shortLabel: string
  longLabel: string
  shortPeriod: SmaPeriod
  longPeriod: SmaPeriod
}

export const SIGNAL_PAIRS: SignalPairDef[] = [
  { id: 1, shortLabel: '1M (21d)', longLabel: '2M (42d)', shortPeriod: 21, longPeriod: 42 },
  { id: 2, shortLabel: '1M (21d)', longLabel: '3M (63d)', shortPeriod: 21, longPeriod: 63 },
  { id: 3, shortLabel: '1M (21d)', longLabel: '6M (126d)', shortPeriod: 21, longPeriod: 126 },
  { id: 4, shortLabel: '3M (63d)', longLabel: '6M (126d)', shortPeriod: 63, longPeriod: 126 },
  { id: 5, shortLabel: '3M (63d)', longLabel: '9M (189d)', shortPeriod: 63, longPeriod: 189 },
  { id: 6, shortLabel: '3M (63d)', longLabel: '12M (252d)', shortPeriod: 63, longPeriod: 252 },
  { id: 7, shortLabel: '6M (126d)', longLabel: '9M (189d)', shortPeriod: 126, longPeriod: 189 },
  { id: 8, shortLabel: '6M (126d)', longLabel: '12M (252d)', shortPeriod: 126, longPeriod: 252 },
  { id: 9, shortLabel: '9M (189d)', longLabel: '12M (252d)', shortPeriod: 189, longPeriod: 252 },
]

// ── SMA computation ────────────────────────────────────────────────────────

/**
 * Compute Simple Moving Average from an array of closing prices.
 * Returns null if fewer than `period` data points are available.
 */
export function computeSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null
  const window = prices.slice(prices.length - period)
  return window.reduce((sum, p) => sum + p, 0) / period
}

/**
 * Compute all six SMAs (21, 42, 63, 126, 189, 252) from closing prices.
 * Missing values (insufficient data) are null.
 */
export function computeAllSMAs(prices: number[]): Record<SmaPeriod, number | null> {
  return {
    21: computeSMA(prices, 21),
    42: computeSMA(prices, 42),
    63: computeSMA(prices, 63),
    126: computeSMA(prices, 126),
    189: computeSMA(prices, 189),
    252: computeSMA(prices, 252),
  }
}

// ── Scoring ────────────────────────────────────────────────────────────────

export interface SignalScore {
  pair: SignalPairDef
  shortSMA: number | null
  longSMA: number | null
  isBull: boolean // short SMA > long SMA
  dataIssue?: string
}

export interface StrategyResult {
  /** Date of evaluation (ISO-8601) */
  evaluatedAt: string
  /** QQQ closing price on evaluation date */
  currentPrice: number
  /** All six SMA values */
  smas: Record<SmaPeriod, number | null>
  /** Individual signal scores */
  scores: SignalScore[]
  /** Total number of bullish signals (0–9) */
  totalBullish: number
  /** Binary position recommendation */
  recommendation: 'TQQQ' | 'SGOV'
}

/**
 * Score all 9 signal pairs from daily closing prices.
 * Returns null if fewer than 21 data points exist (minimum for 1M SMA).
 */
export function evaluateStrategy(prices: number[], evaluatedAt?: string): StrategyResult | null {
  if (!prices || prices.length < 21) return null

  const currentPrice = prices[prices.length - 1]
  const smas = computeAllSMAs(prices)

  const scores: SignalScore[] = SIGNAL_PAIRS.map((pair) => {
    const shortSMA = smas[pair.shortPeriod]
    const longSMA = smas[pair.longPeriod]

    const dataIssue =
      shortSMA === null
        ? `Insufficient data for ${pair.shortLabel} SMA (need ${pair.shortPeriod} prices, have ${prices.length})`
        : longSMA === null
          ? `Insufficient data for ${pair.longLabel} SMA (need ${pair.longPeriod} prices, have ${prices.length})`
          : undefined

    const isBull = shortSMA !== null && longSMA !== null && shortSMA > longSMA

    return { pair, shortSMA, longSMA, isBull, dataIssue }
  })

  const totalBullish = scores.filter((s) => s.isBull).length
  const recommendation = totalBullish >= 5 ? 'TQQQ' : 'SGOV'

  return {
    evaluatedAt: evaluatedAt ?? new Date().toISOString(),
    currentPrice,
    smas,
    scores,
    totalBullish,
    recommendation,
  }
}

// ── Trend detection (informational) ────────────────────────────────────────

export interface RegimeInfo {
  label: string
  description: string
}

export function classifyRegime(totalBullish: number): RegimeInfo {
  if (totalBullish >= 8)
    return { label: 'Strong uptrend', description: 'High signal confidence — most timeframes aligned bullish' }
  if (totalBullish >= 6)
    return { label: 'Moderate uptrend', description: 'Broadly bullish — monitor for weakening next month' }
  if (totalBullish === 5)
    return { label: 'Borderline bull', description: 'Exactly at the threshold — watch closely next month' }
  if (totalBullish === 4)
    return { label: 'Borderline bear', description: 'Just below threshold — could flip either way' }
  if (totalBullish >= 2)
    return { label: 'Moderate downtrend', description: 'Signals broadly aligned bearish across timeframes' }
  return { label: 'Strong downtrend', description: 'Maximum defensive posture — all timeframes bearish' }
}

/**
 * Detect which signals changed between two consecutive months.
 */
export function diffSignals(
  current: StrategyResult,
  prior: StrategyResult
): { flipped: { id: number; from: boolean; to: boolean }[]; direction: 'Strengthening' | 'Weakening' | 'Stable' } {
  const flipped = current.scores
    .map((cs, i) => {
      const ps = prior.scores[i]
      if (!ps || cs.isBull === ps.isBull) return null
      return { id: cs.pair.id, from: ps.isBull, to: cs.isBull }
    })
    .filter((f): f is { id: number; from: boolean; to: boolean } => f !== null)

  const direction =
    current.totalBullish > prior.totalBullish
      ? 'Strengthening'
      : current.totalBullish < prior.totalBullish
        ? 'Weakening'
        : 'Stable'

  return { flipped, direction }
}

// ── SMA computation from BrokerageKlineBar[] ──────────────────────────────

import type { BrokerageKlineBar } from '@lokfi/brokerage-core'

/**
 * Extract sorted closing prices from BrokerageKlineBar array (oldest first).
 */
export function extractPrices(bars: BrokerageKlineBar[]): number[] {
  const sorted = [...bars].sort((a, b) => a.timestamp - b.timestamp)
  return sorted.map((b) => b.close)
}
