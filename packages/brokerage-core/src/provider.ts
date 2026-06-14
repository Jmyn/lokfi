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
  BrokerageKlineBar,
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
   * Maximum days of history the provider's API retains.
   * When computing the initial (never-synced) `since` date, the orchestrator
   * clamps the lookback to this value. Omit when the API has no practical
   * retention limit (e.g. Tiger keeps the 10-year default).
   */
  readonly maxLookbackDays?: number

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
   * Fetch historical K-line (OHLCV) bars for a symbol.
   *
   * Used by the Signals tab to compute the 9 Sig Lite indicator.
   * Providers SHOULD return daily bars sorted chronologically (oldest first).
   *
   * Rate-limit expectations:
   *   - Providers should use their own internal throttle/retry logic.
   *   - The caller will cache results with a 5-minute TTL and will not
   *     call this method more than once per symbol per cache window.
   *
   * Error semantics:
   *   - Throws the provider's standard error types on API failure (auth,
   *     rate limit, network).
   *   - Throws a clear "Not Implemented" error if the provider does not
   *     support historical bar queries.
   *
   * @param symbol     - Trading symbol (e.g. "TQQQ")
   * @param period     - Bar aggregation period
   * @param lookbackDays - Maximum number of days of history to return
   */
  fetchHistoricalBars(
    symbol: string,
    period: 'day' | 'week' | 'month',
    lookbackDays: number
  ): Promise<BrokerageKlineBar[]>

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
