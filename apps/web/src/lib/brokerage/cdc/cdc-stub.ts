/**
 * CDC (Crypto.com) stub provider.
 *
 * Implements BrokerageProvider to prove the abstraction works across
 * multiple brokerages. All methods return empty arrays — this is a
 * placeholder that can be replaced with a real Crypto.com Exchange API
 * integration later.
 */

import type {
  BrokerageAccount,
  BrokerageCorpAction,
  BrokeragePosition,
  BrokerageTransaction,
} from '@lokfi/brokerage-core'
import type { BrokerageProvider } from '@lokfi/brokerage-core'

const SOURCE = 'cdc'

export class CdcStubProvider implements BrokerageProvider {
  readonly source = SOURCE
  readonly displayName = 'Crypto.com'

  async fetchPositions(): Promise<BrokeragePosition[]> {
    // Real implementation would call CDC Exchange API:
    // GET /v1/private/get-account-summary
    return []
  }

  async fetchTransactions(since: Date): Promise<BrokerageTransaction[]> {
    // Real implementation: GET /v1/private/get-trades
    void since // intentionally unused in stub
    return []
  }

  async fetchCorpActions(since: Date): Promise<BrokerageCorpAction[]> {
    // Crypto.com does not have traditional corporate actions
    void since
    return []
  }

  async fetchAccount(): Promise<BrokerageAccount[]> {
    // Real implementation: GET /v1/private/get-account-summary
    return []
  }

  async validateConnection(): Promise<boolean> {
    // Real implementation would call a lightweight API health check
    return false
  }
}
