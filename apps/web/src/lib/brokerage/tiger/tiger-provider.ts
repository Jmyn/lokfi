/**
 * Tiger brokerage provider — wraps the TigerHttpClient, fetches data
 * from the Tiger OpenAPI, and maps responses to normalized types.
 *
 * Implements BrokerageProvider from @lokfi/brokerage-core.
 */

import type {
  BrokerageAccount,
  BrokerageFundDetail,
  BrokeragePosition,
  BrokerageTransaction,
} from '@lokfi/brokerage-core'
import type { BrokerageProvider, ProviderProgress } from '@lokfi/brokerage-core'
import { toYYYYMMDD } from '../../format'
import {
  SOURCE,
  adaptAsset,
  adaptAssetSegment,
  adaptFundDetail,
  adaptOrder,
  adaptPosition,
  enrichTradeFundDetail,
} from './tiger-adapter'
import { TigerHttpClient } from './tiger-http-client'
import type { TigerAsset, TigerClientConfig, TigerFundDetail, TigerOrder, TigerPosition } from './tiger-types'

export interface TigerProviderOptions {
  config: TigerClientConfig
}

const FUND_DETAIL_PAGE_SIZE = 100
const FUND_DETAIL_PAGE_DELAY_MS = 6100
const TRANSACTIONS_CHUNK_DAYS = 90

export class TigerProvider implements BrokerageProvider {
  readonly source = SOURCE
  readonly displayName = 'Tiger Brokers'
  private client: TigerHttpClient
  private account: string

  /** Cache of last fetched filled orders for enrichment use */
  private lastFilledOrders: BrokerageTransaction[] = []

  constructor(options: TigerProviderOptions) {
    this.client = new TigerHttpClient(options.config)
    this.account = options.config.account
  }

  /** Build bizContent JSON string with account injected */
  private bizContent(extra?: Record<string, unknown>): string {
    return JSON.stringify({
      account: this.account,
      ...extra,
    })
  }

  async fetchPositions(_onProgress?: ProviderProgress): Promise<BrokeragePosition[]> {
    const raw = await this.client.execute<unknown>({
      method: 'positions',
      bizContent: this.bizContent(),
    })

    // Debug: log response shape
    console.debug(
      '[tiger-provider] Raw positions response type:',
      typeof raw,
      Array.isArray(raw)
        ? 'array'
        : typeof raw === 'object'
          ? `object keys=${Object.keys(raw as object).join(',')}`
          : typeof raw
    )

    // Handle both { items: [...] } and direct array responses
    let tigerPositions: TigerPosition[]
    if (Array.isArray(raw)) {
      tigerPositions = raw
    } else if (raw && typeof raw === 'object' && 'items' in (raw as Record<string, unknown>)) {
      tigerPositions = ((raw as Record<string, unknown>).items as TigerPosition[]) ?? []
    } else {
      console.warn('[tiger-provider] Unexpected positions response shape — no positions returned')
      tigerPositions = []
    }

    // Debug: log secType breakdown
    const byType: Record<string, number> = {}
    for (const p of tigerPositions) {
      const t = p.secType || 'UNDEFINED'
      byType[t] = (byType[t] ?? 0) + 1
    }
    console.debug('[tiger-provider] Positions by secType:', JSON.stringify(byType))
    tigerPositions.forEach((p) => console.debug(`  secType=${p.secType} symbol=${p.symbol} qty=${p.position}`))

    return tigerPositions.map(adaptPosition)
  }

  /**
   * Fetch filled orders in 90-day chunks with pagination.
   *
   * The Tiger `filled_orders` API:
   *   - Requires start_date/end_date (≤90 day window per call)
   *   - Supports page_token-based pagination (default limit ~100, max 300)
   *   - Returns { items: TigerOrder[], nextPageToken?: string }
   *
   * Strategy:
   *   1. Split the full date range into ≤90-day windows
   *   2. For each window, paginate via page_token until exhausted
   *   3. Adapt each TigerOrder → BrokerageTransaction
   *   4. Deduplicate across chunks (safety net for boundary-straddling orders)
   *   5. Cache filled orders for fund_detail enrichment
   */
  async fetchTransactions(since: Date, onProgress?: ProviderProgress): Promise<BrokerageTransaction[]> {
    // Add 1 day to end date because the Tiger API treats end_date as exclusive
    // (transactions up to but not including end_date). Without this, today's
    // transactions would be excluded from the query.
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + 1)
    const chunks = this.getDateChunks(since, endDate, TRANSACTIONS_CHUNK_DAYS)

    const allTransactions: BrokerageTransaction[] = []

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const { start, end } = chunks[chunkIdx]
      const label = `${toYYYYMMDD(start)} → ${toYYYYMMDD(end)}`
      onProgress?.(`Fetching transactions chunk ${chunkIdx + 1}/${chunks.length} (${label})`)

      let pageToken: string | undefined
      let hasMore = true

      while (hasMore) {
        const bizContent: Record<string, unknown> = {
          start_date: toYYYYMMDD(start),
          end_date: toYYYYMMDD(end),
          limit: 300, // Max allowed per page to minimize round trips
        }
        if (pageToken) {
          bizContent.page_token = pageToken
        }

        // Response shape: { items: TigerOrder[], nextPageToken?: string }
        // or in rare cases a direct TigerOrder[] (be defensive)
        type FilledOrdersResponse = {
          items?: TigerOrder[]
          nextPageToken?: string
        }

        const response = await this.client.execute<FilledOrdersResponse | TigerOrder[]>({
          method: 'filled_orders',
          bizContent: this.bizContent(bizContent),
        })

        const orders = Array.isArray(response) ? response : (response?.items ?? [])

        for (const order of orders) {
          const txn = adaptOrder(order)
          if (txn && new Date(txn.executedAt) >= since) {
            allTransactions.push(txn)
          }
        }

        // Check for next page (only in object responses, not raw arrays)
        if (!Array.isArray(response)) {
          const nextToken = response?.nextPageToken
          if (nextToken && nextToken.length > 0) {
            pageToken = nextToken
          } else {
            hasMore = false
          }
        } else {
          hasMore = false
        }
      }
    }

    // Deduplicate by id across chunks (safety net in case an order's
    // execution date straddles a chunk boundary)
    const seen = new Set<string>()
    const deduped = allTransactions.filter((txn) => {
      if (seen.has(txn.id)) return false
      seen.add(txn.id)
      return true
    })

    // Cache filled orders for enrichment
    this.lastFilledOrders = deduped

    return deduped
  }

  async fetchFundDetails(since: Date, onProgress?: ProviderProgress): Promise<BrokerageFundDetail[]> {
    // Add 1 day to end date because the Tiger API treats end_date as exclusive
    // (records up to but not including end_date).
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const endDate = toYYYYMMDD(tomorrow)
    const startDate = toYYYYMMDD(since)

    // Tiger fund_details response includes pagination metadata at the top level.
    // The API expects offset-based pagination via `start` (not `page`).
    // We parse pageCount from the first response to know how many pages to request.
    type FundDetailResponse = {
      items?: TigerFundDetail[]
      page?: number
      limit?: number
      itemCount?: number
      pageCount?: number
    }

    // Fetch first page (offset 0) to discover total page count
    onProgress?.('Fetching page 1...')
    const firstPage = await this.client.execute<FundDetailResponse>({
      method: 'fund_details',
      bizContent: this.bizContent({
        fund_type: 'ALL',
        seg_types: ['SEC'],
        start_date: startDate,
        end_date: endDate,
        limit: FUND_DETAIL_PAGE_SIZE,
        start: 0,
      }),
    })

    const totalPageCount = firstPage?.pageCount ?? 1
    const allRaw: TigerFundDetail[] = firstPage?.items ?? []

    // Fetch remaining pages (2 through pageCount) using offset-based pagination
    for (let page = 2; page <= totalPageCount; page++) {
      onProgress?.(`Fetching page ${page}/${totalPageCount}...`)
      const raw = await this.client.execute<FundDetailResponse>({
        method: 'fund_details',
        bizContent: this.bizContent({
          fund_type: 'ALL',
          seg_types: ['SEC'],
          start_date: startDate,
          end_date: endDate,
          limit: FUND_DETAIL_PAGE_SIZE,
          start: (page - 1) * FUND_DETAIL_PAGE_SIZE,
        }),
      })

      const pageItems = raw?.items ?? []
      allRaw.push(...pageItems)

      // Delay between pages to respect rate limits (after each page except the last)
      if (page < totalPageCount) {
        onProgress?.(`Pausing before page ${page + 1}/${totalPageCount}...`)
      }
      if (page < totalPageCount) {
        await new Promise((resolve) => setTimeout(resolve, FUND_DETAIL_PAGE_DELAY_MS))
      }
    }

    // Deduplicate by id — safety net in case the API returns overlapping data
    // across pages (e.g. due to data changes during pagination).
    const seen = new Set<string>()
    const deduped = allRaw.filter((item) => {
      const key = String(item.id ?? '')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Adapt each raw record
    onProgress?.(`Adapting ${deduped.length} records...`)
    const adapted = deduped.map(adaptFundDetail).filter((fd): fd is BrokerageFundDetail => fd !== null)

    // Enrich TRADE records with filled order data
    if (this.lastFilledOrders.length > 0) {
      const enriched = adapted.map((fd) => {
        if (fd.classifiedType === 'TRADE') {
          return enrichTradeFundDetail(fd, this.lastFilledOrders)
        }
        return fd
      })
      return enriched
    }

    return adapted
  }

  async fetchAccount(_onProgress?: ProviderProgress): Promise<BrokerageAccount[]> {
    // Assets response: { items: TigerAsset[] } where each item has segments[]
    type AssetResponse = { items?: TigerAsset[] }
    const accounts: BrokerageAccount[] = []

    // Fetch standard assets
    const standard = await this.client.execute<AssetResponse>({
      method: 'assets',
      bizContent: this.bizContent(),
    })

    const items = standard?.items ?? []
    for (const item of items) {
      accounts.push(adaptAsset(item))
      // Also add per-segment records
      if (item.segments) {
        for (const seg of item.segments) {
          accounts.push(adaptAssetSegment(seg, item.currency))
        }
      }
    }

    // Prime assets may fail if account doesn't have futures permissions
    try {
      const prime = await this.client.execute<AssetResponse>({
        method: 'prime_assets',
        bizContent: this.bizContent(),
      })
      const primeItems = prime?.items ?? []
      for (const item of primeItems) {
        accounts.push(adaptAsset(item))
        if (item.segments) {
          for (const seg of item.segments) {
            accounts.push(adaptAssetSegment(seg, item.currency))
          }
        }
      }
    } catch {
      // Non-critical — prime assets unavailable
    }

    return accounts
  }

  /**
   * Split a date range into chunks no larger than maxDays.
   * Tiger's filled_orders API has a 90-day window limit, so this is used
   * to fetch all-time transaction history in compliant segments.
   */
  private getDateChunks(start: Date, end: Date, maxDays: number): { start: Date; end: Date }[] {
    if (start >= end) return []

    const chunks: { start: Date; end: Date }[] = []
    const current = new Date(start)

    while (current < end) {
      const chunkEnd = new Date(current)
      chunkEnd.setDate(chunkEnd.getDate() + maxDays)

      if (chunkEnd >= end) {
        chunks.push({ start: new Date(current), end: new Date(end) })
        break
      }

      chunks.push({ start: new Date(current), end: new Date(chunkEnd) })
      current.setTime(chunkEnd.getTime())
    }

    return chunks
  }

  async validateConnection(): Promise<boolean> {
    try {
      // Use assets as a lightweight connectivity check
      await this.client.execute<{ items?: TigerAsset[] }>({
        method: 'assets',
        bizContent: this.bizContent(),
      })
      return true
    } catch {
      return false
    }
  }
}
