import type { BrokerageKlineBar } from '@lokfi/brokerage-core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type NineSigLiteState, computeNineSigLite } from './nineSigLite'
import { getSignalProviderWithFallback, invalidateSignalProvider } from './signalProvider'

export interface UseNineSigLiteResult {
  state: NineSigLiteState | null
  isLoading: boolean
  isError: boolean
  error: string | null
  refetch: () => void
  lastUpdated: string | null
  provider: string | null
  allProvidersCount: number | null
  /** Raw K-line bars used for chart rendering */
  bars: BrokerageKlineBar[]
}

// ── Module-level TTL cache ────────────────────────────────────────────────

interface CacheEntry {
  data: NineSigLiteState
  bars: BrokerageKlineBar[]
  fetchedAt: number
}

const TTL_MS = 5 * 60 * 1000 // 5 minutes
const cache = new Map<string, CacheEntry>()

function getFromCache(symbol: string): CacheEntry | undefined {
  const entry = cache.get(symbol)
  if (!entry) return undefined
  const age = Date.now() - entry.fetchedAt
  if (age >= TTL_MS) {
    cache.delete(symbol)
    return undefined
  }
  return entry
}

function setInCache(symbol: string, data: NineSigLiteState, bars: BrokerageKlineBar[]): void {
  cache.set(symbol, { data, bars, fetchedAt: Date.now() })
}

// ── Hook ──────────────────────────────────────────────────────────────────

/**
 * React hook that computes the 9 Sig Lite state for a given symbol.
 *
 * Handles provider resolution, data fetching via `fetchHistoricalBars`,
 * in-memory TTL caching (5-minute), error states, and manual refresh.
 *
 * @param symbol - Trading symbol (e.g. "TQQQ")
 */
export function useNineSigLite(symbol: string): UseNineSigLiteResult {
  const [state, setState] = useState<NineSigLiteState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isError, setIsError] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [provider, setProvider] = useState<string | null>(null)
  const [allProvidersCount, setAllProvidersCount] = useState<number | null>(null)
  const [bars, setBars] = useState<BrokerageKlineBar[]>([])
  const genRef = useRef(0)

  const fetchData = useCallback(async () => {
    const generation = genRef.current + 1
    genRef.current = generation
    const isFresh = () => genRef.current === generation

    setIsLoading(true)
    setIsError(false)
    setError(null)

    // Check cache first
    const cached = getFromCache(symbol)
    if (cached) {
      setState(cached.data)
      setBars(cached.bars)
      setIsLoading(false)
      setLastUpdated(new Date(cached.fetchedAt).toISOString())
      return
    }

    try {
      // Resolve provider
      const { provider: resolvedProvider, allCandidates } = await getSignalProviderWithFallback()

      if (!isFresh()) return

      if (!resolvedProvider) {
        setState(null)
        setIsLoading(false)
        setIsError(false)
        setError(null)
        setProvider(null)
        setAllProvidersCount(allCandidates.length)
        return
      }

      setProvider(resolvedProvider.displayName)
      setAllProvidersCount(allCandidates.length)

      // Fetch historical bars (request 100 days to ensure we have enough for the 91-day lookback)
      const rawBars = await resolvedProvider.fetchHistoricalBars(symbol, 'day', 100)
      setBars(rawBars)

      if (!isFresh()) return

      if (!rawBars || rawBars.length === 0) {
        setState({
          growth: 0,
          target: 0.09,
          delta: 0,
          signal: 'on_track',
          daysAnalyzed: 0,
          asOf: new Date().toISOString(),
          isError: true,
          error: 'No historical data returned',
        })
        setIsLoading(false)
        setIsError(true)
        setError('No historical data returned')
        return
      }

      // Current price = latest bar close
      const latestBar = rawBars[rawBars.length - 1]
      const currentPrice = latestBar.close

      // Find the price 91 days ago (or earliest available)
      const now = Date.now()
      const lookbackTs = now - 91 * 24 * 60 * 60 * 1000

      let refBar = rawBars.find((b) => b.timestamp <= lookbackTs)
      let daysAnalyzed = 91

      if (!refBar) {
        // Not enough data — use the earliest bar
        refBar = rawBars[0]
        const actualDays = (latestBar.timestamp - refBar.timestamp) / (24 * 60 * 60 * 1000)
        daysAnalyzed = Math.max(1, Math.round(actualDays))
      }

      const price91dAgo = refBar.close

      // Compute the 9 Sig state
      const result = computeNineSigLite(
        {
          currentPrice,
          price91dAgo,
          asOf: new Date().toISOString(),
        },
        daysAnalyzed
      )

      if (!isFresh()) return

      if (result.isError) {
        setState(result)
        setIsLoading(false)
        setIsError(true)
        setError(result.error ?? 'Calculation error')
        return
      }

      setState(result)
      setIsLoading(false)
      const nowStr = new Date().toISOString()
      setLastUpdated(nowStr)
      setInCache(symbol, result, rawBars)
    } catch (err) {
      if (!isFresh()) return
      setState(null)
      setIsLoading(false)
      setIsError(true)
      setError(err instanceof Error ? err.message : 'Failed to fetch signal data')
    }
  }, [symbol])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const refetch = useCallback(() => {
    // Bypass cache by deleting it
    cache.delete(symbol)
    invalidateSignalProvider()
    fetchData()
  }, [symbol, fetchData])

  return {
    state,
    isLoading,
    isError,
    error,
    refetch,
    lastUpdated,
    provider,
    allProvidersCount,
    bars,
  }
}
