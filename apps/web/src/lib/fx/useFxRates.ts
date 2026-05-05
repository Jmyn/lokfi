import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { getRates, isStale, storeRates } from './cache'
import { fetchFallbackRates } from './fallback-client'
import { fetchFrankfurterRates } from './frankfurter-client'

export interface UseFxRatesResult {
  rates: Record<string, number> | null
  lastUpdated: string | null
  loading: boolean
  error: string | null
}

/**
 * Hook to fetch and cache FX rates for a given base currency.
 * Uses Frankfurter API as primary source with fallback to open.er-api.com.
 * Caches results in IndexedDB to minimize API calls.
 *
 * @param base - Base currency code (default: USD)
 * @returns Object containing rates, lastUpdated timestamp, loading state, and error message
 */
export function useFxRates(base = 'USD'): UseFxRatesResult {
  const [state, setState] = useState<UseFxRatesResult>({
    rates: null,
    lastUpdated: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      const today = new Date().toISOString().slice(0, 10)
      const cached = await getRates(today, base)

      if (cached && !isStale(cached.date)) {
        if (!cancelled) setState({ rates: cached.rates, lastUpdated: cached.date, loading: false, error: null })
        return
      }

      try {
        const data = await fetchFrankfurterRates(base)
        await storeRates(data)
        if (!cancelled) setState({ rates: data.rates, lastUpdated: data.date, loading: false, error: null })
      } catch (err) {
        try {
          const fallback = await fetchFallbackRates(base)
          await storeRates(fallback)
          if (!cancelled) setState({ rates: fallback.rates, lastUpdated: fallback.date, loading: false, error: null })
        } catch (fallbackErr) {
          // Use most recent cached rates regardless of date
          const allCached = await db.fxRates.where('base').equals(base).reverse().sortBy('date')
          const mostRecent = allCached[0]
          if (mostRecent) {
            if (!cancelled)
              setState({
                rates: mostRecent.rates,
                lastUpdated: mostRecent.date,
                loading: false,
                error: `Using cached rates from ${mostRecent.date}`,
              })
          } else {
            if (!cancelled)
              setState({
                rates: null,
                lastUpdated: null,
                loading: false,
                error: 'FX rates unavailable. Showing original currencies.',
              })
          }
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [base])

  return state
}
