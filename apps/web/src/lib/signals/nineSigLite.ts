/**
 * 9 Sig Lite — pure calculation engine for Jason Kelly's 9% Signal.
 *
 * Compares current price to the price 91 days ago and determines whether
 * the growth is above, below, or on track with the 9% quarterly target.
 *
 * This is the Lite variant: no plan setup, no calendar-quarter alignment,
 * no rebalance triggers. See design.md for the full rationale.
 */

/** Input to the 9 Sig Lite calculator */
export interface NineSigLiteInput {
  /** Current price (latest bar close) */
  currentPrice: number
  /** Price 91 days ago (or earliest available) */
  price91dAgo: number
  /** ISO-8601 timestamp of when the input was computed */
  asOf: string
}

/** Output state of the 9 Sig Lite calculator */
export interface NineSigLiteState {
  /** Raw growth rate (currentPrice / price91dAgo - 1), e.g. 0.09 for +9% */
  growth: number
  /** Target growth rate (always 0.09 for 9%) */
  target: number
  /** Growth minus target, e.g. 0.03 means 3 percentage points above target */
  delta: number
  /** Signal direction */
  signal: 'above' | 'below' | 'on_track'
  /** Number of days of price data actually analyzed */
  daysAnalyzed: number
  /** ISO-8601 timestamp of when the state was computed */
  asOf: string
  /** Current price used in the calculation (latest bar close) */
  currentPrice?: number
  /** Reference price (close of bar ~91 days ago) */
  price91dAgo?: number
  /** If true, the input was invalid and the state should be considered an error */
  isError?: boolean
  /** Human-readable error message */
  error?: string
}

/** Tolerance for "on track": ±0.5 percentage points (0.005) */
export const ON_TRACK_TOLERANCE = 0.005

/**
 * Pure function: compute the 9 Sig Lite state from input prices.
 *
 * The growth rate is `currentPrice / price91dAgo - 1`, compared against
 * the 9% target with a tolerance of ±0.5 percentage points.
 *
 * @param input - Current and reference prices
 * @param daysAnalyzed - Number of days of data actually used (default 91)
 * @returns Computed state with signal classification
 */
export function computeNineSigLite(input: NineSigLiteInput, daysAnalyzed = 91): NineSigLiteState {
  // Validate inputs
  if (!input || !Number.isFinite(input.currentPrice) || !Number.isFinite(input.price91dAgo)) {
    return {
      growth: 0,
      target: 0.09,
      delta: 0,
      signal: 'on_track',
      daysAnalyzed: 0,
      asOf: input?.asOf ?? new Date().toISOString(),
      isError: true,
      error: 'Invalid input: currentPrice and price91dAgo must be numbers',
    }
  }

  if (input.currentPrice <= 0 || input.price91dAgo <= 0) {
    return {
      growth: 0,
      target: 0.09,
      delta: 0,
      signal: 'on_track',
      daysAnalyzed,
      asOf: input.asOf,
      isError: true,
      error: 'Invalid input: prices must be positive',
    }
  }

  const target = 0.09
  const growth = input.currentPrice / input.price91dAgo - 1
  const delta = growth - target

  let signal: 'above' | 'below' | 'on_track'
  if (delta > ON_TRACK_TOLERANCE) {
    signal = 'above'
  } else if (delta < -ON_TRACK_TOLERANCE) {
    signal = 'below'
  } else {
    signal = 'on_track'
  }

  return {
    growth,
    target,
    delta,
    signal,
    daysAnalyzed,
    asOf: input.asOf,
    currentPrice: input.currentPrice,
    price91dAgo: input.price91dAgo,
  }
}
