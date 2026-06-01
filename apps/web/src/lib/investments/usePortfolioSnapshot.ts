import type { BrokerageAccount, BrokeragePosition } from '@lokfi/brokerage-core'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import type { CurrencyOption } from '../../pages/investments/currencyPreference'
import { db } from '../db/db'
import { convertAmount } from '../fx/convert'

export function computePortfolioTotalValue(
  positions: BrokeragePosition[],
  accounts: BrokerageAccount[],
  preferredCurrency: CurrencyOption,
  fxRates: Record<string, number> | null
): number {
  const shouldConvert = preferredCurrency !== 'Original' && fxRates != null
  let sum = 0
  for (const p of positions) {
    const v = p.marketValue ?? p.quantity * p.avgCost
    sum += shouldConvert ? convertAmount(v, p.currency, preferredCurrency, fxRates) : v
  }
  for (const a of accounts) {
    sum += shouldConvert ? convertAmount(a.cashBalance, a.currency, preferredCurrency, fxRates) : a.cashBalance
  }
  return sum
}

export function usePortfolioSnapshot(preferredCurrency: CurrencyOption, fxRates: Record<string, number> | null): void {
  const positions = useLiveQuery(() => db.brokeragePositions.toArray(), [])
  const accounts = useLiveQuery(() => db.brokerageAccounts.toArray(), [])

  useEffect(() => {
    // Skip if data not loaded or currency is mixed-original (not comparable across currencies)
    if (!positions || !accounts || preferredCurrency === 'Original') return
    const totalValue = computePortfolioTotalValue(positions, accounts, preferredCurrency, fxRates)
    const date = new Date().toISOString().slice(0, 10)
    db.portfolioSnapshots.put({ date, totalValue, currency: preferredCurrency })
  }, [positions, accounts, preferredCurrency, fxRates])
}
