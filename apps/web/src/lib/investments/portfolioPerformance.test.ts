import { describe, expect, it } from 'vitest'
import { computeReturn, filterSnapshotsByRange } from './portfolioPerformance'

const snap = (date: string, value: number) => ({ date, value })

describe('filterSnapshotsByRange', () => {
  const snapshots = [
    snap('2025-05-12', 10000),
    snap('2025-08-12', 11000),
    snap('2025-11-12', 11500),
    snap('2026-02-12', 12000),
    snap('2026-05-11', 12500),
  ]
  const now = new Date('2026-05-12T00:00:00Z')

  it('returns all snapshots for All', () => {
    expect(filterSnapshotsByRange(snapshots, 'All', now)).toHaveLength(5)
  })

  it('filters to last 1 month', () => {
    const result = filterSnapshotsByRange(snapshots, '1M', now)
    expect(result.every((s) => s.date >= '2026-04-12')).toBe(true)
    expect(result).toHaveLength(1)
  })

  it('filters to last 3 months', () => {
    const result = filterSnapshotsByRange(snapshots, '3M', now)
    expect(result.every((s) => s.date >= '2026-02-12')).toBe(true)
    expect(result).toHaveLength(2)
  })

  it('filters to last 6 months', () => {
    const result = filterSnapshotsByRange(snapshots, '6M', now)
    expect(result.every((s) => s.date >= '2025-11-12')).toBe(true)
    expect(result).toHaveLength(3)
  })

  it('filters to last 12 months (1Y)', () => {
    const result = filterSnapshotsByRange(snapshots, '1Y', now)
    expect(result.every((s) => s.date >= '2025-05-12')).toBe(true)
    expect(result).toHaveLength(5)
  })

  it('filters YTD from Jan 1 of current year', () => {
    const result = filterSnapshotsByRange(snapshots, 'YTD', now)
    expect(result.every((s) => s.date >= '2026-01-01')).toBe(true)
    expect(result).toHaveLength(2)
  })
})

describe('computeReturn', () => {
  it('returns null for fewer than 2 points', () => {
    expect(computeReturn([])).toBeNull()
    expect(computeReturn([snap('2026-01-01', 10000)])).toBeNull()
  })

  it('returns null if first value is zero', () => {
    expect(computeReturn([snap('2026-01-01', 0), snap('2026-01-02', 100)])).toBeNull()
  })

  it('computes positive return', () => {
    const result = computeReturn([snap('2026-01-01', 10000), snap('2026-05-01', 11000)])
    expect(result).not.toBeNull()
    expect(result!.pct).toBeCloseTo(10, 5)
    expect(result!.abs).toBeCloseTo(1000, 5)
  })

  it('computes negative return', () => {
    const result = computeReturn([snap('2026-01-01', 10000), snap('2026-05-01', 9000)])
    expect(result!.pct).toBeCloseTo(-10, 5)
    expect(result!.abs).toBeCloseTo(-1000, 5)
  })

  it('uses first and last points only, ignoring middle values', () => {
    const result = computeReturn([
      snap('2026-01-01', 10000),
      snap('2026-03-01', 999999),
      snap('2026-05-01', 12000),
    ])
    expect(result!.pct).toBeCloseTo(20, 5)
    expect(result!.abs).toBeCloseTo(2000, 5)
  })
})
