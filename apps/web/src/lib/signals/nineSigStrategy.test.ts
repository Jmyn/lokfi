import { describe, expect, it } from 'vitest'
import {
  classifyRegime,
  computeAllSMAs,
  computeSMA,
  diffSignals,
  evaluateStrategy,
  extractPrices,
} from './nineSigStrategy'

// ── Helpers ────────────────────────────────────────────────────────────────

function straightLine(price: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => price + i * 0.5)
}

function bullPrices(): number[] {
  // Prices that are trending up — short SMAs > long SMAs
  return [
    100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
    // rising from 121 onward
    121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143,
    144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166,
    167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189,
    190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210,
    // strong upward trend at end
    211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233,
    234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256,
    257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279,
    280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302,
    303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 323, 324, 325,
    326, 327, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348,
    349, 350,
  ]
}

function bearPrices(): number[] {
  // Flat then sharply declining
  const flat = Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i * 0.1) * 5)
  const decline = Array.from({ length: 100 }, (_, i) => 100 - i * 0.6)
  return [...flat, ...decline]
}

// ── computeSMA ─────────────────────────────────────────────────────────────

describe('computeSMA', () => {
  it('computes SMA from last N prices', () => {
    const prices = [10, 20, 30, 40, 50]
    expect(computeSMA(prices, 3)).toBe(40) // (30+40+50)/3
  })

  it('returns null when insufficient data', () => {
    expect(computeSMA([10, 20], 5)).toBeNull()
  })

  it('handles empty array', () => {
    expect(computeSMA([], 10)).toBeNull()
  })
})

// ── computeAllSMAs ─────────────────────────────────────────────────────────

describe('computeAllSMAs', () => {
  it('computes all six SMAs from sufficient data', () => {
    const prices = straightLine(100, 300)
    const smas = computeAllSMAs(prices)
    expect(smas[21]).not.toBeNull()
    expect(smas[42]).not.toBeNull()
    expect(smas[63]).not.toBeNull()
    expect(smas[126]).not.toBeNull()
    expect(smas[189]).not.toBeNull()
    expect(smas[252]).not.toBeNull()
  })

  it('returns null for SMAs exceeding data length', () => {
    const prices = straightLine(100, 80) // 80 data points
    const smas = computeAllSMAs(prices)
    expect(smas[21]).not.toBeNull() // 21 ≤ 80 ✓
    expect(smas[42]).not.toBeNull() // 42 ≤ 80 ✓
    expect(smas[63]).not.toBeNull() // 63 ≤ 80 ✓
    expect(smas[126]).toBeNull() // 126 > 80 ✗
    expect(smas[189]).toBeNull() // 189 > 80 ✗
    expect(smas[252]).toBeNull() // 252 > 80 ✗
  })
})

// ── evaluateStrategy ───────────────────────────────────────────────────────

describe('evaluateStrategy', () => {
  it('returns null with fewer than 21 prices', () => {
    expect(evaluateStrategy([1, 2, 3])).toBeNull()
  })

  it('recommends TQQQ when all signals are bullish (strong uptrend)', () => {
    const prices = bullPrices()
    const result = evaluateStrategy(prices)
    expect(result).not.toBeNull()
    expect(result!.totalBullish).toBeGreaterThanOrEqual(5)
    expect(result!.recommendation).toBe('TQQQ')
    expect(result!.currentPrice).toBe(prices[prices.length - 1])
  })

  it('recommends SGOV when most signals are bearish (downtrend)', () => {
    const prices = bearPrices()
    const result = evaluateStrategy(prices)
    expect(result).not.toBeNull()
    expect(result!.totalBullish).toBeLessThan(5)
    expect(result!.recommendation).toBe('SGOV')
  })

  it('computes all 9 signal pairs', () => {
    const prices = bullPrices()
    const result = evaluateStrategy(prices)!
    expect(result.scores).toHaveLength(9)
    result.scores.forEach((s) => {
      expect(s.pair.id).toBeGreaterThanOrEqual(1)
      expect(s.pair.id).toBeLessThanOrEqual(9)
    })
  })

  it('sets evaluatedAt from parameter', () => {
    const result = evaluateStrategy(bullPrices(), '2026-05-30T00:00:00Z')
    expect(result!.evaluatedAt).toBe('2026-05-30T00:00:00Z')
  })
})

// ── classifyRegime ─────────────────────────────────────────────────────────

describe('classifyRegime', () => {
  it('classifies 9 bullish as strong uptrend', () => {
    const r = classifyRegime(9)
    expect(r.label).toContain('Strong')
  })

  it('classifies 5 as borderline bull', () => {
    const r = classifyRegime(5)
    expect(r.label).toContain('Borderline bull')
  })

  it('classifies 4 as borderline bear', () => {
    const r = classifyRegime(4)
    expect(r.label).toContain('Borderline bear')
  })

  it('classifies 0 as strong downtrend', () => {
    const r = classifyRegime(0)
    expect(r.label).toContain('Strong downtrend')
  })
})

// ── diffSignals ────────────────────────────────────────────────────────────

describe('diffSignals', () => {
  it('detects strengthening', () => {
    const current = evaluateStrategy(bullPrices())!
    const prior = evaluateStrategy(bearPrices())!
    const diff = diffSignals(current, prior)
    expect(diff.direction).toBe('Strengthening')
  })

  it('detects weakening', () => {
    const current = evaluateStrategy(bearPrices())!
    const prior = evaluateStrategy(bullPrices())!
    const diff = diffSignals(current, prior)
    expect(diff.direction).toBe('Weakening')
  })

  it('detects stable (same prices = same result)', () => {
    const prices = straightLine(100, 300)
    const current = evaluateStrategy(prices)!
    const prior = evaluateStrategy(prices)!
    const diff = diffSignals(current, prior)
    expect(diff.direction).toBe('Stable')
    expect(diff.flipped).toHaveLength(0)
  })
})

// ── extractPrices ──────────────────────────────────────────────────────────

describe('extractPrices', () => {
  it('extracts sorted closes from bars', () => {
    const bars = [
      { timestamp: 300, close: 30 },
      { timestamp: 100, close: 10 },
      { timestamp: 200, close: 20 },
    ] as any
    const prices = extractPrices(bars)
    expect(prices).toEqual([10, 20, 30])
  })

  it('handles empty array', () => {
    expect(extractPrices([])).toEqual([])
  })
})
