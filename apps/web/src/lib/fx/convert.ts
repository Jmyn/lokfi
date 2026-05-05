/**
 * Convert an amount from one currency to another using cached rates.
 * Rates object should contain exchange rates relative to a base currency.
 * Example: rates = { SGD: 1.35, HKD: 7.82 } for USD base.
 *
 * @param amount - Original amount in source currency
 * @param from - Source currency code
 * @param to - Target currency code
 * @param rates - Exchange rates map where values are rates relative to base currency
 * @returns Converted amount, or original amount if rates are missing
 */
export function convertAmount(amount: number, from: string, to: string, rates: Record<string, number>): number {
  if (from === to) return amount
  // Rates are relative to a base currency (e.g. USD). The base currency
  // is NOT in the rates map — its implicit rate is 1.
  // amount_in_BASE = amount / rates[from]
  // amount_in_TO = amount_in_BASE * rates[to]
  const fromRate = from in rates ? rates[from] : 1 // base currency → rate of 1
  const toRate = to in rates ? rates[to] : 1 // base currency → rate of 1
  return (amount / fromRate) * toRate
}
