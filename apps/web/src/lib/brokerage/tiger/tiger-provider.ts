/**
 * Tiger brokerage provider — wraps the TigerHttpClient, fetches data
 * from the Tiger OpenAPI, and maps responses to normalized types.
 *
 * Implements BrokerageProvider from @lokfi/brokerage-core.
 */

import type {
  BrokerageAccount,
  BrokerageCorpAction,
  BrokeragePosition,
  BrokerageTransaction,
} from '@lokfi/brokerage-core'
import type { BrokerageProvider } from '@lokfi/brokerage-core'
import { SOURCE, adaptAsset, adaptAssetSegment, adaptCorpAction, adaptOrder, adaptPosition } from './tiger-adapter'
import { TigerHttpClient, TigerHttpError } from './tiger-http-client'
import type { TigerAsset, TigerClientConfig, TigerCorpAction, TigerOrder, TigerPosition } from './tiger-types'

export interface TigerProviderOptions {
  config: TigerClientConfig
  /** Lookback window for transaction/corp action history (days) */
  lookbackDays?: number
}

export class TigerProvider implements BrokerageProvider {
  readonly source = SOURCE
  readonly displayName = 'Tiger Brokers'
  private client: TigerHttpClient
  private account: string

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

  async fetchPositions(): Promise<BrokeragePosition[]> {
    const raw = await this.client.execute<{ items?: TigerPosition[] }>({
      method: 'positions',
      bizContent: this.bizContent(),
    })

    const positions = raw?.items ?? []
    return positions.map(adaptPosition)
  }

  async fetchTransactions(since: Date): Promise<BrokerageTransaction[]> {
    // Strategy:
    // 1. Get completed orders (status = Filled) wrapped in { items: [...] }
    // 2. Filter by date range
    // 3. Adapt each to normalized transaction

    const filledOrdersRaw = await this.client.execute<{ items?: TigerOrder[] }>({
      method: 'filled_orders',
      bizContent: this.bizContent({
        start_date: since.toISOString().slice(0, 10),
        end_date: new Date().toISOString().slice(0, 10),
      }),
    })

    const filledOrders = filledOrdersRaw?.items ?? []
    const transactions: BrokerageTransaction[] = []

    for (const order of filledOrders) {
      const txn = adaptOrder(order)
      if (txn && new Date(txn.executedAt) >= since) {
        transactions.push(txn)
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

    return transactions
  }

  async fetchCorpActions(since: Date): Promise<BrokerageCorpAction[]> {
    // Tiger exposes corporate actions via fund_details with fund_type=7 (CORPORATE_ACTION)
    // Response is wrapped in { items: [...] }
    try {
      const raw = await this.client.execute<{ items?: TigerCorpAction[] }>({
        method: 'fund_details',
        bizContent: this.bizContent({
          fund_type: 'CORPORATE_ACTION',
          seg_types: ['SEC'],
          start_date: since.toISOString().slice(0, 10),
          end_date: new Date().toISOString().slice(0, 10),
        }),
      })

      const actions = raw?.items ?? []
      return actions.map(adaptCorpAction).filter((a): a is BrokerageCorpAction => a !== null)
    } catch (err) {
      // Corporate actions may not be available on all accounts.
      // Log the error at the orchestrator level so it appears in sync_log.
      if (err instanceof TigerHttpError) {
        throw err
      }
      throw err
    }
  }

  async fetchAccount(): Promise<BrokerageAccount[]> {
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
