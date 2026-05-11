import type { BrokeragePosition } from '@lokfi/brokerage-core'

export const UNASSIGNED_BUCKET_ID = 'unassigned'

export interface DbPortfolioBucket {
  id: string
  name: string
  color: string
  sortOrder: number
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface DbPortfolioBucketAssignment {
  securityKey: string
  bucketId: string
  createdAt: string
  updatedAt: string
}

export const DEFAULT_PORTFOLIO_BUCKETS: DbPortfolioBucket[] = [
  {
    id: 'bucket_growth',
    name: 'Growth',
    color: '#3b82f6',
    sortOrder: 0,
    isDefault: true,
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z',
  },
  {
    id: 'bucket_income',
    name: 'Income',
    color: '#22c55e',
    sortOrder: 1,
    isDefault: true,
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z',
  },
  {
    id: 'bucket_cash',
    name: 'Cash',
    color: '#f59e0b',
    sortOrder: 2,
    isDefault: true,
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z',
  },
]

export function createDefaultPortfolioBuckets(timestamp = new Date().toISOString()): DbPortfolioBucket[] {
  return DEFAULT_PORTFOLIO_BUCKETS.map((bucket) => ({
    ...bucket,
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
}

const STOCK_LIKE_TYPES = new Set(['STK', 'CASH', 'FUND', 'MLEG'])

export interface BucketAggregationRow {
  bucketId: string
  name: string
  color: string
  value: number
  pct: number
}

export type BucketFilterValue = 'all' | 'unassigned' | string

export function isStockLikePosition(position: BrokeragePosition): boolean {
  return position.secType == null || STOCK_LIKE_TYPES.has(position.secType)
}

export function getSecurityKey(position: BrokeragePosition): string {
  const secType = position.secType ?? 'STK'
  return `${secType}:${position.symbol.trim().toUpperCase()}`
}

export function buildBucketLookup(buckets: DbPortfolioBucket[]): Map<string, DbPortfolioBucket> {
  return new Map(buckets.map((bucket) => [bucket.id, bucket]))
}

export function buildAssignmentLookup(assignments: DbPortfolioBucketAssignment[]): Map<string, string> {
  return new Map(assignments.map((assignment) => [assignment.securityKey, assignment.bucketId]))
}

export function getAssignedBucketId(
  position: BrokeragePosition,
  assignments: DbPortfolioBucketAssignment[]
): string | null {
  return buildAssignmentLookup(assignments).get(getSecurityKey(position)) ?? null
}

export function removeAssignmentsForBucket(
  assignments: DbPortfolioBucketAssignment[],
  bucketId: string
): DbPortfolioBucketAssignment[] {
  return assignments.filter((assignment) => assignment.bucketId !== bucketId)
}

export function filterPositionsByBucket(
  positions: BrokeragePosition[],
  assignments: DbPortfolioBucketAssignment[],
  filter: BucketFilterValue
): BrokeragePosition[] {
  if (filter === 'all') return positions

  const assignmentBySecurity = buildAssignmentLookup(assignments)

  return positions.filter((position) => {
    if (!isStockLikePosition(position)) return false

    const assignedBucketId = assignmentBySecurity.get(getSecurityKey(position)) ?? null
    if (filter === UNASSIGNED_BUCKET_ID) return assignedBucketId == null

    return assignedBucketId === filter
  })
}

export function buildBucketOptions(buckets: DbPortfolioBucket[]): Array<{ id: string; label: string }> {
  return [
    { id: 'all', label: 'All buckets' },
    ...[...buckets].sort((a, b) => a.sortOrder - b.sortOrder).map((bucket) => ({ id: bucket.id, label: bucket.name })),
    { id: UNASSIGNED_BUCKET_ID, label: 'Unassigned' },
  ]
}

export function getPortfolioBucketAggregation({
  positions,
  buckets,
  assignments,
  convertValue,
}: {
  positions: BrokeragePosition[]
  buckets: DbPortfolioBucket[]
  assignments: DbPortfolioBucketAssignment[]
  convertValue: (value: number, position: BrokeragePosition) => number
}): BucketAggregationRow[] {
  const bucketById = buildBucketLookup(buckets)
  const assignmentBySecurity = buildAssignmentLookup(assignments)
  const totals = new Map<string, number>()

  for (const position of positions) {
    if (!isStockLikePosition(position)) continue

    const rawValue = position.marketValue ?? position.quantity * position.avgCost
    if (rawValue <= 0) continue

    const assignedBucketId = assignmentBySecurity.get(getSecurityKey(position))
    const bucketId = assignedBucketId && bucketById.has(assignedBucketId) ? assignedBucketId : UNASSIGNED_BUCKET_ID
    totals.set(bucketId, (totals.get(bucketId) ?? 0) + convertValue(rawValue, position))
  }

  const totalValue = [...totals.values()].reduce((sum, value) => sum + value, 0)
  const rows: BucketAggregationRow[] = []

  for (const bucket of [...buckets].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const value = totals.get(bucket.id) ?? 0
    if (value <= 0) continue

    rows.push({
      bucketId: bucket.id,
      name: bucket.name,
      color: bucket.color,
      value,
      pct: totalValue > 0 ? (value / totalValue) * 100 : 0,
    })
  }

  const unassignedValue = totals.get(UNASSIGNED_BUCKET_ID) ?? 0
  if (unassignedValue > 0) {
    rows.push({
      bucketId: UNASSIGNED_BUCKET_ID,
      name: 'Unassigned',
      color: '#94a3b8',
      value: unassignedValue,
      pct: totalValue > 0 ? (unassignedValue / totalValue) * 100 : 0,
    })
  }

  return rows
}
