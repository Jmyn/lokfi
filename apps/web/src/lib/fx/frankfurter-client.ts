export interface FxRateResponse {
  date: string
  base: string
  rates: Record<string, number>
}

/**
 * Fetch latest FX rates from Frankfurter API.
 * @param base - Base currency code (default: USD)
 * @returns FX rate response with date, base, and rates map
 * @throws Error if API request fails
 */
export async function fetchFrankfurterRates(base = 'USD'): Promise<FxRateResponse> {
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?from=${base}`)
  if (!res.ok) throw new Error(`Frankfurter API error: ${res.status}`)
  return res.json()
}
