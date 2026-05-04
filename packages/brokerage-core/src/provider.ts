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
  BrokerageCorpAction,
  BrokeragePosition,
  BrokerageSource,
  BrokerageTransaction,
} from './types.js'

export interface BrokerageProvider {
  /** Unique identifier for this brokerage (e.g. 'tiger', 'ibkr', 'crypto_com') */
  readonly source: BrokerageSource

  /** Display name for this brokerage (e.g. 'Tiger Brokers') */
  readonly displayName: string

  /**
   * Fetch current positions (holdings).
   * Returns an empty array if no positions exist.
   */
  fetchPositions(): Promise<BrokeragePosition[]>

  /**
   * Fetch filled order history since a given date.
   * Used to populate the transaction log. Append-only semantics —
   * the orchestrator will dedupe by orderId.
   *
   * @param since - Earliest date to fetch transactions from
   */
  fetchTransactions(since: Date): Promise<BrokerageTransaction[]>

  /**
   * Fetch corporate actions (dividends, splits, rights) applied to the account.
   * Returns empty array if the provider does not expose this data.
   *
   * @param since - Earliest date to fetch actions from
   */
  fetchCorpActions(since: Date): Promise<BrokerageCorpAction[]>

  /**
   * Fetch account summary — cash balance, net liquidation per currency segment.
   * Returns an array with one entry per currency segment (e.g. one for USD, one for SGD).
   */
  fetchAccount(): Promise<BrokerageAccount[]>

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
