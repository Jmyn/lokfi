import { describe, expect, it } from 'vitest'
import { type NineSigLiteInput, ON_TRACK_TOLERANCE, computeNineSigLite } from './nineSigLite'

function makeInput(overrides?: Partial<NineSigLiteInput>): NineSigLiteInput {
  return {
    currentPrice: 109,
    price91dAgo: 100,
    asOf: '2026-06-01T00:00:00Z',
    ...overrides,
  }
}

describe('computeNineSigLite', () => {
  it('returns "above" when growth exceeds target by more than tolerance', () => {
    // 12% growth vs 9% target → above
    const input = makeInput({ currentPrice: 112, price91dAgo: 100 })
    const result = computeNineSigLite(input)

    expect(result.signal).toBe('above')
    expect(result.growth).toBeCloseTo(0.12, 4)
    expect(result.delta).toBeCloseTo(0.03, 4)
    expect(result.target).toBe(0.09)
    expect(result.daysAnalyzed).toBe(91)
  })

  it('returns "below" when growth is below target by more than tolerance', () => {
    // 3% growth vs 9% target → below
    const input = makeInput({ currentPrice: 103, price91dAgo: 100 })
    const result = computeNineSigLite(input)

    expect(result.signal).toBe('below')
    expect(result.growth).toBeCloseTo(0.03, 4)
    expect(result.delta).toBeCloseTo(-0.06, 4)
  })

  it('returns "on_track" when growth is within tolerance of target', () => {
    // 9.1% growth vs 9% target → on track (delta 0.001 < 0.005)
    const input = makeInput({ currentPrice: 109.1, price91dAgo: 100 })
    const result = computeNineSigLite(input)

    expect(result.signal).toBe('on_track')
    expect(result.delta).toBeCloseTo(0.001, 4)
  })

  it('returns "on_track" for exact 9% growth', () => {
    // Exact 9% — use integer arithmetic to avoid floating point drift
    // 109/100 = 1.09, so growth = 0.09 exactly in theory, but JS gives
    // 0.08999999999999997 due to IEEE 754. The signal is still 'on_track'
    // because |delta| = 8.3e-17 is well within tolerance.
    const input = makeInput({ currentPrice: 109, price91dAgo: 100 })
    const result = computeNineSigLite(input)

    expect(result.signal).toBe('on_track')
    expect(Math.abs(result.delta)).toBeLessThan(ON_TRACK_TOLERANCE)
    expect(result.growth).toBeCloseTo(0.09, 4)
  })

  it('returns "above" at exact tolerance boundary + epsilon', () => {
    // delta = tolerance + 0.0001 → above
    const targetPrice = 100 * (1 + 0.09 + ON_TRACK_TOLERANCE + 0.0001)
    const input = makeInput({ currentPrice: targetPrice, price91dAgo: 100 })
    const result = computeNineSigLite(input)

    expect(result.signal).toBe('above')
  })

  it('returns "below" at exact tolerance boundary - epsilon', () => {
    // delta = -(tolerance + 0.0001) → below
    const targetPrice = 100 * (1 + 0.09 - ON_TRACK_TOLERANCE - 0.0001)
    const input = makeInput({ currentPrice: targetPrice, price91dAgo: 100 })
    const result = computeNineSigLite(input)

    expect(result.signal).toBe('below')
  })

  it('handles negative growth (price declined)', () => {
    const input = makeInput({ currentPrice: 80, price91dAgo: 100 })
    const result = computeNineSigLite(input)

    expect(result.signal).toBe('below')
    expect(result.growth).toBeCloseTo(-0.2, 4)
  })

  it('returns error state for missing/invalid inputs', () => {
    const result = computeNineSigLite({} as NineSigLiteInput)

    expect(result.isError).toBe(true)
    expect(result.error).toBeDefined()
  })

  it('returns error state for NaN prices', () => {
    const input = makeInput({ currentPrice: Number.NaN, price91dAgo: 100 })
    const result = computeNineSigLite(input)

    expect(result.isError).toBe(true)
    expect(result.error).toContain('numbers')
  })

  it('returns error state for non-positive prices', () => {
    const input = makeInput({ currentPrice: 0, price91dAgo: 100 })
    const result = computeNineSigLite(input)

    expect(result.isError).toBe(true)
    expect(result.error).toContain('positive')
  })

  it('accepts custom daysAnalyzed', () => {
    const input = makeInput()
    const result = computeNineSigLite(input, 45)

    expect(result.daysAnalyzed).toBe(45)
  })

  it('preserves the asOf timestamp in the output', () => {
    const input = makeInput({ asOf: '2026-06-15T12:00:00Z' })
    const result = computeNineSigLite(input)

    expect(result.asOf).toBe('2026-06-15T12:00:00Z')
  })
})
