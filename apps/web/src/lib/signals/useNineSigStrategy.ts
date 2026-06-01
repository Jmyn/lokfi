import type { BrokerageKlineBar } from '@lokfi/brokerage-core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type StrategyResult, evaluateStrategy, extractPrices } from './nineSigStrategy'
import { getSignalProvider, invalidateSignalProvider } from './signalProvider'

export interface UseNineSigStrategyResult {
  result: StrategyResult | null
  isLoading: boolean
  isError: boolean
  error: string | null
  refetch: () => void
  lastUpdated: string | null
}

// ── Module-level TTL cache ────────────────────────────────────────────────

interface CacheEntry {
  result: StrategyResult
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

function setInCache(symbol: string, result: StrategyResult): void {
  cache.set(symbol, { result, fetchedAt: Date.now() })
}

// ── Hook ──────────────────────────────────────────────────────────────────

/**
 * React hook that evaluates the 9 SIG strategy from QQQ daily bars.
 *
 * Fetches ~400 calendar days of QQQ history (enough for the 252-day SMA),
 * computes the 9 SMA cross-over signals, and returns the recommendation.
 */
export function useNineSigStrategy(symbol = 'QQQ'): UseNineSigStrategyResult {
  const [result, setResult] = useState<StrategyResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isError, setIsError] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
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
      setResult(cached.result)
      setIsLoading(false)
      setLastUpdated(new Date(cached.fetchedAt).toISOString())
      return
    }

    try {
      const resolvedProvider = await getSignalProvider()

      if (!isFresh()) return

      if (!resolvedProvider) {
        setResult(null)
        setIsLoading(false)
        return
      }

      // Fetch ~400 calendar days to guarantee enough trading days for 252-day SMA
      const bars: BrokerageKlineBar[] = await resolvedProvider.fetchHistoricalBars(symbol, 'day', 400)

      if (!isFresh()) return

      if (!bars || bars.length === 0) {
        setResult(null)
        setIsLoading(false)
        setIsError(true)
        setError('No QQQ price data available')
        return
      }

      const prices = extractPrices(bars)
      const strategyResult = evaluateStrategy(prices, new Date().toISOString())

      if (!isFresh()) return

      if (!strategyResult) {
        setResult(null)
        setIsLoading(false)
        setIsError(true)
        setError(`Insufficient QQQ data: need at least 21 trading days, have ${prices.length}`)
        return
      }

      setResult(strategyResult)
      setIsLoading(false)
      const nowStr = new Date().toISOString()
      setLastUpdated(nowStr)
      setInCache(symbol, strategyResult)
    } catch (err) {
      if (!isFresh()) return
      setResult(null)
      setIsLoading(false)
      setIsError(true)
      setError(err instanceof Error ? err.message : 'Failed to fetch strategy data')
    }
  }, [symbol])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const refetch = useCallback(() => {
    cache.delete(symbol)
    invalidateSignalProvider()
    fetchData()
  }, [symbol, fetchData])

  return { result, isLoading, isError: isError || !!error, error, refetch, lastUpdated }
}
