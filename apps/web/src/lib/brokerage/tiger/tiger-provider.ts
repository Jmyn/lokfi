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

  async fetchTransactions(since: Date, _onProgress?: ProviderProgress): Promise<BrokerageTransaction[]> {
    // Strategy:
    // 1. Chunk the date range into ≤90-day windows (Tiger API limit)
    // 2. Fetch completed orders (status = Filled) for each chunk
    // 3. Adapt each to normalized transaction
    // 4. Deduplicate across chunks (safety net)
    // 5. Cache filled orders for enrichment use in fetchFundDetails

    const endDate = new Date()
    const chunks = this.getDateChunks(since, endDate, TRANSACTIONS_CHUNK_DAYS)

    const allTransactions: BrokerageTransaction[] = []

    for (const { start, end } of chunks) {
      const filledOrdersRaw = await this.client.execute<{ items?: TigerOrder[] }>({
        method: 'filled_orders',
        bizContent: this.bizContent({
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
        }),
      })

      const filledOrders = filledOrdersRaw?.items ?? []

      for (const order of filledOrders) {
        const txn = adaptOrder(order)
        if (txn && new Date(txn.executedAt) >= since) {
          allTransactions.push(txn)
        }

        // Also fetch detailed transaction records per order
        if (order.orderId) {
          try {
            const detail = await this.client.execute<{ items?: unknown[] }>({
              method: 'order_transactions',
              bizContent: this.bizContent({ id: order.orderId }),
            })
            const txnItems = detail?.items ?? []
            if (txnItems.length > 0) {
              // Per-fill transaction records — extends the order-level data
            }
          } catch {
            // Non-critical — order-level data is sufficient
          }
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
    const endDate = new Date().toISOString().slice(0, 10)
    const startDate = since.toISOString().slice(0, 10)

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
