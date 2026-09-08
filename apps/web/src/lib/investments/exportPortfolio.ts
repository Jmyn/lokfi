import type {
  BrokerageAccount,
  BrokeragePosition,
  BrokeragePositionExtension,
  BrokerageSyncLog,
} from '@lokfi/brokerage-core'
import type { LokfiDatabase } from '../db/db'
import {
  type DbPortfolioBucket,
  type DbPortfolioBucketAssignment,
  buildAssignmentLookup,
  buildBucketLookup,
  getSecurityKey,
} from './portfolioBuckets'

export interface PortfolioExportData {
  positions: BrokeragePosition[]
  accounts: BrokerageAccount[]
  extensions: BrokeragePositionExtension[]
  buckets: DbPortfolioBucket[]
  assignments: DbPortfolioBucketAssignment[]
  syncLogs: BrokerageSyncLog[]
}

function value(input: string | number | null | undefined): string {
  if (input == null || input === '' || (typeof input === 'number' && !Number.isFinite(input))) return 'Unavailable'
  return String(input)
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
}

function basisQuality(extensions: BrokeragePositionExtension[], positionId: string): string {
  const raw = extensions.find(
    (extension) => extension.positionId === positionId && extension.key === 'basisQuality'
  )?.value
  if (!raw) return 'Not recorded'
  let quality: unknown = raw
  try {
    quality = JSON.parse(raw)
  } catch {
    // Older extensions can contain plain strings.
  }
  switch (quality) {
    case 'ok':
      return 'Computed from recorded history'
    case 'manual':
      return 'Includes manual opening cost'
    case 'estimated':
      return 'Estimated'
    case 'incomplete':
      return 'Incomplete (cost basis and profit/loss may be understated or overstated)'
    default:
      return 'Not recorded'
  }
}

/** Explicitly format approved fields; never serialize raw DB records or extensions. */
export function formatPortfolioExport(data: PortfolioExportData, exportedAt: Date): string {
  const bucketById = buildBucketLookup(data.buckets)
  const assignmentBySecurity = buildAssignmentLookup(data.assignments)
  const lines = [
    'LOKFI PORTFOLIO',
    `Exported at: ${exportedAt.toISOString()}`,
    'Scope: all investment holdings, cash balances, and allocation targets currently stored in Lokfi.',
    'This export does not refresh broker data. Fetched timestamps below describe data freshness, not live quote times.',
    'Amounts remain in their original currencies; no currency conversion or combined portfolio total is applied.',
    'Unavailable values are not zero. Market values are never substituted with cost estimates.',
    'Cost basis and unrealized profit/loss are stored broker or computed values; see the cost basis quality for each holding.',
    'This is a current snapshot, not a backup or complete transaction/performance history.',
    '',
    `HOLDINGS (${data.positions.length})`,
  ]

  const positions = [...data.positions].sort((a, b) =>
    `${a.currency}|${a.source}|${a.symbol}|${a.identifier ?? ''}`.localeCompare(
      `${b.currency}|${b.source}|${b.symbol}|${b.identifier ?? ''}`
    )
  )
  if (positions.length === 0) lines.push('No holdings stored.')
  for (const position of positions) {
    const bucketId = assignmentBySecurity.get(getSecurityKey(position))
    lines.push(
      '',
      `${value(position.symbol)}${position.name ? ` - ${value(position.name)}` : ''}`,
      `  Source: ${value(position.source)}`,
      `  Instrument type: ${value(position.secType)}`,
      `  Currency: ${value(position.currency)}`,
      `  Quantity: ${value(position.quantity)}`,
      `  Average cost: ${value(position.avgCost)}`,
      `  Cost basis quality: ${basisQuality(data.extensions, position.id)}`,
      `  Market value: ${value(position.marketValue)}`,
      `  Unrealized profit/loss: ${value(position.unrealizedPnl)}`,
      `  Unrealized profit/loss (%): ${value(position.unrealizedPnlPercent)}`,
      `  Allocation bucket: ${value(bucketId ? (bucketById.get(bucketId)?.name ?? 'Unassigned') : 'Unassigned')}`,
      `  Data fetched at: ${value(position.updatedAt)}`
    )
    if (position.identifier) lines.push(`  Instrument identifier: ${value(position.identifier)}`)
    if (position.multiplier != null) lines.push(`  Contract multiplier: ${value(position.multiplier)}`)
  }

  lines.push(
    '',
    `INVESTMENT CASH (${data.accounts.length})`,
    'Overall and segment balances may overlap. Do not add an overall balance to its component segments.'
  )
  if (data.accounts.length === 0) lines.push('No investment cash balances stored.')
  for (const account of [...data.accounts].sort((a, b) =>
    `${a.currency}|${a.source}|${a.segType ?? ''}`.localeCompare(`${b.currency}|${b.source}|${b.segType ?? ''}`)
  )) {
    lines.push(
      '',
      `${value(account.source)} / ${value(account.currency)}`,
      `  Segment: ${value(account.segType ?? 'Overall / unspecified')}`,
      `  Cash balance: ${value(account.cashBalance)}`,
      `  Data fetched at: ${value(account.updatedAt)}`
    )
  }

  lines.push('', 'ALLOCATION TARGETS')
  if (data.buckets.length === 0) lines.push('No allocation buckets stored.')
  for (const bucket of [...data.buckets].sort((a, b) => a.sortOrder - b.sortOrder)) {
    lines.push(`${value(bucket.name)}: ${bucket.targetPct == null ? 'No target set' : `${value(bucket.targetPct)}%`}`)
  }

  lines.push(
    '',
    'SOURCE SYNC STATUS',
    'Latest recorded attempt per source/category; failures can leave older data in this snapshot.'
  )
  const latestLogs = new Map<string, BrokerageSyncLog>()
  for (const log of data.syncLogs) {
    const key = `${log.source} / ${log.category}`
    const previous = latestLogs.get(key)
    if (!previous || log.lastSyncAt >= previous.lastSyncAt) latestLogs.set(key, log)
  }
  if (latestLogs.size === 0) lines.push('No sync history stored; source freshness cannot be confirmed.')
  for (const [key, log] of [...latestLogs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`${value(key)}: ${value(log.status)} at ${value(log.lastSyncAt)}`)
  }
  return `${lines.join('\n')}\n`
}

/** Read a consistent local snapshot without touching credentials, bank data, or any network API. */
export async function createPortfolioExport(database: LokfiDatabase, exportedAt = new Date()) {
  const data = await database.transaction(
    'r',
    [
      database.brokeragePositions,
      database.brokerageAccounts,
      database.brokeragePositionExtensions,
      database.portfolioBuckets,
      database.portfolioBucketAssignments,
      database.brokerageSyncLog,
    ],
    async (): Promise<PortfolioExportData> => {
      const [positions, accounts, extensions, buckets, assignments, syncLogs] = await Promise.all([
        database.brokeragePositions.toArray(),
        database.brokerageAccounts.toArray(),
        database.brokeragePositionExtensions.filter((extension) => extension.key === 'basisQuality').toArray(),
        database.portfolioBuckets.toArray(),
        database.portfolioBucketAssignments.toArray(),
        database.brokerageSyncLog.toArray(),
      ])
      return { positions, accounts, extensions, buckets, assignments, syncLogs }
    }
  )
  return {
    filename: `lokfi-portfolio-${exportedAt.toISOString().slice(0, 10)}.txt`,
    text: formatPortfolioExport(data, exportedAt),
  }
}
