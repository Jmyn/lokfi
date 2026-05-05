import { db } from '../../lib/db/db'

const CURRENCIES = ['SGD', 'USD', 'HKD', 'Original'] as const
export type CurrencyOption = (typeof CURRENCIES)[number]

/**
 * Retrieve the user's preferred display currency from settings.
 * Defaults to 'SGD' if not set or invalid.
 * @returns Preferred currency option
 */
export async function getPreferredCurrency(): Promise<CurrencyOption> {
  const s = await db.settings.get('investments:preferredCurrency')
  const val = s?.value as CurrencyOption
  return CURRENCIES.includes(val) ? val : 'SGD'
}

/**
 * Save the user's preferred display currency to settings.
 * @param currency - Currency option to save
 */
export async function setPreferredCurrency(currency: CurrencyOption): Promise<void> {
  await db.settings.put({ key: 'investments:preferredCurrency', value: currency })
}

export { CURRENCIES }
