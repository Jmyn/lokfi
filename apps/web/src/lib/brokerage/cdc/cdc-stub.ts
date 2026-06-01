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
  BrokerageFundDetail,
  BrokerageKlineBar,
  BrokeragePosition,
  BrokerageTransaction,
} from '@lokfi/brokerage-core'
import type { BrokerageProvider, ProviderProgress } from '@lokfi/brokerage-core'

const SOURCE = 'cdc'

export class CdcStubProvider implements BrokerageProvider {
  readonly source = SOURCE
  readonly displayName = 'Crypto.com'

  async fetchPositions(_onProgress?: ProviderProgress): Promise<BrokeragePosition[]> {
    return []
  }

  async fetchTransactions(_since: Date, _onProgress?: ProviderProgress): Promise<BrokerageTransaction[]> {
    return []
  }

  async fetchFundDetails(_since: Date, _onProgress?: ProviderProgress): Promise<BrokerageFundDetail[]> {
    return []
  }

  async fetchAccount(_onProgress?: ProviderProgress): Promise<BrokerageAccount[]> {
    return []
  }

  async fetchHistoricalBars(
    _symbol: string,
    _period: 'day' | 'week' | 'month',
    _lookbackDays: number
  ): Promise<BrokerageKlineBar[]> {
    throw new Error('Not Implemented')
  }

  async validateConnection(): Promise<boolean> {
    // Real implementation would call a lightweight API health check
    return false
  }
}
