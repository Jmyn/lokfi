import type { FxRateResponse } from './frankfurter-client'

/**
 * Fetch fallback FX rates from open.er-api.com when Frankfurter is unavailable.
 * @param base - Base currency code (default: USD)
 * @returns FX rate response with date, base, and rates map
 * @throws Error if API request fails
 */
export async function fetchFallbackRates(base = 'USD'): Promise<FxRateResponse> {
  const res = await fetch(`https://open.er-api.com/v6/latest/${base}`)
  if (!res.ok) throw new Error(`Fallback API error: ${res.status}`)
  const data = await res.json()
  return {
    date: data.time_last_update_utc ? data.time_last_update_utc.slice(0, 10) : new Date().toISOString().slice(0, 10),
    base: data.base_code,
    rates: data.rates,
  }
}
