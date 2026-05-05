/**
 * BrokerageProvider interface — every brokerage integration must implement this.
 *
 * Each provider handles:
 *   - Connecting to a brokerage API (auth, HTTP)
 *   - Fetching raw data
 *   - Mapping to the normalized `Brokerage*` types
 *
 * The sync orchestrator calls these methods and persists results to Dexie.
 */

import type {
  BrokerageAccount,
  BrokerageFundDetail,
  BrokeragePosition,
  BrokerageSource,
  BrokerageTransaction,
} from './types.js'

/**
 * Callback for sub-method progress updates (e.g. pagination, rate-limit pauses).
 * Invoked by the provider during long-running fetch operations so the UI can
 * display granular status messages.
 */
export type ProviderProgress = (message: string) => void

export interface BrokerageProvider {
  /** Unique identifier for this brokerage (e.g. 'tiger', 'ibkr', 'crypto_com') */
  readonly source: BrokerageSource

  /** Display name for this brokerage (e.g. 'Tiger Brokers') */
  readonly displayName: string

  /**
   * Fetch current positions (holdings).
   * Returns an empty array if no positions exist.
   *
   * @param onProgress - Optional callback for sub-method progress updates
   */
  fetchPositions(onProgress?: ProviderProgress): Promise<BrokeragePosition[]>

  /**
   * Fetch filled order history since a given date.
   * Used to populate the transaction log. Append-only semantics —
   * the orchestrator will dedupe by orderId.
   *
   * @param since - Earliest date to fetch transactions from
   * @param onProgress - Optional callback for sub-method progress updates
   */
  fetchTransactions(since: Date, onProgress?: ProviderProgress): Promise<BrokerageTransaction[]>

  /**
   * Fetch fund details (cash ledger — dividends, fees, trades, transfers, rebates).
   * Returns empty array if the provider does not expose this data.
   *
   * @param since - Earliest date to fetch fund details from
   * @param onProgress - Optional callback for sub-category progress updates (e.g. pagination)
   */
  fetchFundDetails(since: Date, onProgress?: ProviderProgress): Promise<BrokerageFundDetail[]>

  /**
   * Fetch account summary — cash balance, net liquidation per currency segment.
   * Returns an array with one entry per currency segment (e.g. one for USD, one for SGD).
   *
   * @param onProgress - Optional callback for sub-method progress updates
   */
  fetchAccount(onProgress?: ProviderProgress): Promise<BrokerageAccount[]>

  /**
   * Lightweight connectivity check — confirms auth works without fetching
   * full datasets. Used for initial setup verification.
   */
  validateConnection(): Promise<boolean>
}

/**
 * Configuration passed to a BrokerageProvider at construction time.
 * The shape varies by provider; the orchestrator passes whatever the
 * provider's constructor expects. Typically this comes from the
 * encrypted credential store.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface BrokerageProviderConfig {
  [key: string]: unknown
}
