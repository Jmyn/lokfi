export type RangeKey = '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'All'

export interface SnapshotPoint {
  date: string  // YYYY-MM-DD
  value: number
}

export function filterSnapshotsByRange(
  snapshots: SnapshotPoint[],
  range: RangeKey,
  now: Date,
): SnapshotPoint[] {
  if (range === 'All') return [...snapshots]

  let cutoff: Date
  if (range === 'YTD') {
    cutoff = new Date(now.getFullYear(), 0, 1)
  } else {
    const monthsBack = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }[range]
    cutoff = new Date(now)
    cutoff.setMonth(cutoff.getMonth() - monthsBack)
  }

  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return snapshots.filter((s) => s.date >= cutoffStr)
}

export function computeReturn(points: SnapshotPoint[]): { pct: number; abs: number } | null {
  if (points.length < 2) return null
  const first = points[0].value
  const last = points[points.length - 1].value
  if (first === 0) return null
  return { pct: ((last - first) / first) * 100, abs: last - first }
}
