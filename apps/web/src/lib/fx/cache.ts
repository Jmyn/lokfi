import { db } from '../db/db'
import type { FxRateRecord } from '../db/db'

/**
 * Retrieve cached FX rates for a given date and base currency.
 * @param date - Date string in 'YYYY-MM-DD' format
 * @param base - Base currency code (e.g., 'USD')
 * @returns FxRateRecord if found, undefined otherwise
 */
export async function getRates(date: string, base: string): Promise<FxRateRecord | undefined> {
  return db.fxRates.get([date, base])
}

/**
 * Store FX rates in the database cache.
 * @param record - FxRateRecord to store
 */
export async function storeRates(record: FxRateRecord): Promise<void> {
  await db.fxRates.put(record)
}

/**
 * Check if a date string is stale (not today).
 * @param date - Date string in 'YYYY-MM-DD' format
 * @returns true if date is not today's date, false otherwise
 */
export function isStale(date: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  return date !== today
}
