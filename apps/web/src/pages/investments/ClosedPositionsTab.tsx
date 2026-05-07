import type { BrokerageFundDetail, BrokerageTransaction } from '@lokfi/brokerage-core'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../../lib/db/db'
import { convertAmount } from '../../lib/fx/convert'
import type { CurrencyOption } from './currencyPreference'
import { getDividends } from './holdingCalculations'

interface ClosedPositionsTabProps {
  preferredCurrency: CurrencyOption
  fxRates: Record<string, number> | null
  fxLastUpdated: string | null
  fxError: string | null
}

interface ClosedPosition {
  symbol: string
  totalBuyQty: number
  totalSellQty: number
  totalCost: number
  totalProceeds: number
  totalCommission: number
  realizedPnl: number
  dividends: number
  totalReturnPct: number | null
  firstBuyDate: string
  lastSellDate: string
  currency: string
}

const fmtCache = new Map<string, Intl.NumberFormat>()
function getFormatter(currency: string): Intl.NumberFormat {
  if (!fmtCache.has(currency)) {
    fmtCache.set(
      currency,
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    )
  }
  return fmtCache.get(currency)!
}

function formatCurrency(amount: number, currency: string): string {
  return getFormatter(currency).format(amount)
}

function pnClass(pnl: number) {
  if (pnl > 0) return 'text-emerald-600 dark:text-emerald-400'
  if (pnl < 0) return 'text-red-600 dark:text-red-400'
  return 'text-gray-500 dark:text-gray-400'
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
}

export function ClosedPositionsTab({ preferredCurrency, fxRates, fxLastUpdated, fxError }: ClosedPositionsTabProps) {
  const [sortKey, setSortKey] = useState<'symbol' | 'cost' | 'proceeds' | 'pnl' | 'dividends' | 'return' | 'date'>(
    'pnl'
  )
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const allTransactions = useLiveQuery(() => db.brokerageTransactions.toArray(), []) ?? []
  const allPositions = useLiveQuery(() => db.brokeragePositions.toArray(), []) ?? []

  // Fund details for TRADE (closed position P&L) and DIVIDEND/DIVIDEND_TAX
  const allFundDetails =
    useLiveQuery(
      () => db.brokerageFundDetails.where('classifiedType').anyOf(['TRADE', 'DIVIDEND', 'DIVIDEND_TAX']).toArray(),
      []
    ) ?? []

  // Symbols that have current open positions — exclude from closed list
  const openSymbols = useMemo(() => new Set(allPositions.map((p) => p.symbol)), [allPositions])

  const closedPositions = useMemo(() => {
    // Use fund detail TRADE records as primary data source (full history).
    // BrokerageTransaction only covers the lookback window (default 90 days),
    // while fund details go back to account inception.
    const tradeFds = allFundDetails.filter((fd) => fd.classifiedType === 'TRADE' && !openSymbols.has(fd.symbol ?? ''))

    // Supplement with brokerage transactions for quantity and date data
    const txnsBySymbol = new Map<string, BrokerageTransaction[]>()
    for (const t of allTransactions) {
      if (openSymbols.has(t.symbol)) continue
      if (!txnsBySymbol.has(t.symbol)) txnsBySymbol.set(t.symbol, [])
      txnsBySymbol.get(t.symbol)!.push(t)
    }

    // Group fund detail TRADE records by symbol
    const bySymbol = new Map<string, BrokerageFundDetail[]>()
    for (const fd of tradeFds) {
      const sym = fd.symbol ?? ''
      if (!bySymbol.has(sym)) bySymbol.set(sym, [])
      bySymbol.get(sym)!.push(fd)
    }

    // Also include symbols that only appear in transactions (with secType='STK')
    for (const t of allTransactions) {
      if (openSymbols.has(t.symbol)) continue
      if (t.secType !== 'STK' && t.secType != null) continue
      if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, [])
    }

    const results: ClosedPosition[] = []
    for (const [symbol, fds] of bySymbol) {
      let totalCost = 0
      let totalProceeds = 0
      let firstBuyDate = ''
      let lastSellDate = ''
      let currency = 'USD'

      // Fund detail TRADE amounts: negative = BUY (cost), positive = SELL (proceeds)
      for (const fd of fds) {
        if (fd.classifiedType !== 'TRADE') continue
        currency = fd.currency
        if (fd.amount < 0) {
          totalCost += Math.abs(fd.amount)
          const d = fd.businessDate
          if (!firstBuyDate || d < firstBuyDate) firstBuyDate = d
        } else {
          totalProceeds += fd.amount
          const d = fd.businessDate
          if (!lastSellDate || d > lastSellDate) lastSellDate = d
        }
      }

      // Also consider transaction data for better date range
      const txns = txnsBySymbol.get(symbol) ?? []
      let totalBuyQty = 0
      let totalSellQty = 0
      let totalCommission = 0
      for (const t of txns) {
        if (t.secType !== 'STK' && t.secType != null) continue
        totalCommission += t.commission ?? 0
        if (t.action === 'BUY') {
          totalBuyQty += t.quantity
          const d = t.executedAt
          if (!firstBuyDate || d < firstBuyDate) firstBuyDate = d
        } else {
          totalSellQty += Math.abs(t.quantity)
          const d = t.executedAt
          if (!lastSellDate || d > lastSellDate) lastSellDate = d
        }
      }

      // Skip symbols that have transaction records but no fund detail TRADEs
      // (indicates missing data rather than a real closed position)
      if (totalCost === 0 && totalProceeds === 0) continue

      // Net dividends for this symbol (lifetime) — use getDividends to ensure
      // tax reversals are capped so they never inflate net beyond gross.
      const dividends = getDividends(symbol, allFundDetails)

      const realizedPnl = totalProceeds - totalCost
      const totalReturnPct = totalCost > 0 ? ((realizedPnl + dividends) / totalCost) * 100 : null

      results.push({
        symbol,
        totalBuyQty,
        totalSellQty,
        totalCost,
        totalProceeds,
        totalCommission,
        realizedPnl,
        dividends,
        totalReturnPct,
        firstBuyDate,
        lastSellDate,
        currency,
      })
    }

    return results
  }, [allFundDetails, allTransactions, openSymbols])

  // Sort
  const sorted = useMemo(() => {
    const arr = [...closedPositions]
    function getCmp(a: ClosedPosition, b: ClosedPosition): number {
      switch (sortKey) {
        case 'symbol':
          return a.symbol.localeCompare(b.symbol)
        case 'cost':
          return a.totalCost - b.totalCost
        case 'proceeds':
          return a.totalProceeds - b.totalProceeds
        case 'pnl':
          return a.realizedPnl - b.realizedPnl
        case 'dividends':
          return a.dividends - b.dividends
        case 'return':
          return (a.totalReturnPct ?? 0) - (b.totalReturnPct ?? 0)
        case 'date':
          return a.lastSellDate.localeCompare(b.lastSellDate)
      }
    }
    arr.sort((a, b) => (sortDir === 'asc' ? 1 : -1) * getCmp(a, b))
    return arr
  }, [closedPositions, sortKey, sortDir])

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'pnl' || key === 'return' || key === 'date' ? 'desc' : 'asc')
    }
    setPage(0)
  }

  // Pagination
  const [page, setPage] = useState(0)
  const perPage = 50
  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage))
  const safePage = Math.min(page, totalPages - 1)
  const paginated = sorted.slice(safePage * perPage, (safePage + 1) * perPage)

  // Summary KPIs
  const showConverted = preferredCurrency !== 'Original' && fxRates != null
  const displayCurrency = showConverted ? preferredCurrency : 'USD'

  const totalRealizedPnl = sorted.reduce((s, p) => {
    const v = showConverted ? convertAmount(p.realizedPnl, p.currency, preferredCurrency, fxRates!) : p.realizedPnl
    return s + v
  }, 0)
  const totalDividends = sorted.reduce((s, p) => {
    const v = showConverted ? convertAmount(p.dividends, p.currency, preferredCurrency, fxRates!) : p.dividends
    return s + v
  }, 0)
  const totalCost = sorted.reduce((s, p) => {
    const v = showConverted ? convertAmount(p.totalCost, p.currency, preferredCurrency, fxRates!) : p.totalCost
    return s + v
  }, 0)
  const totalReturnPct = totalCost > 0 ? ((totalRealizedPnl + totalDividends) / totalCost) * 100 : null

  // ── Empty state ─────────────────────────────────────────────────────────

  if (closedPositions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p className="text-lg font-medium mb-2">No closed positions yet</p>
        <p className="text-sm">Sync your brokerage account to see realized P&L for positions you've fully exited.</p>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────

  const kpiCardClass = 'rounded-xl border p-5'
  const monoClass = 'font-mono tabular-nums'
  const headerCellClass =
    'px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200'
  const cellClass = 'px-3 py-2.5 text-right font-mono tabular-nums text-gray-900 dark:text-white'

  return (
    <div className="space-y-6">
      {/* FX status */}
      {showConverted && fxLastUpdated && (
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 px-1">
          <span>
            FX rates as of {new Date(fxLastUpdated).toLocaleString()} · displaying in{' '}
            <span className="font-medium text-gray-600 dark:text-gray-300">{preferredCurrency}</span>
          </span>
          {fxError && <span className="text-amber-600 dark:text-amber-400">· FX error: {fxError}</span>}
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={kpiCardClass} style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Positions Closed</p>
          <p className={`text-xl font-semibold ${monoClass}`} style={{ color: 'var(--text-primary)' }}>
            {closedPositions.length}
          </p>
        </div>
        <div className={kpiCardClass} style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Realized P&L</p>
          <p className={`text-xl font-semibold ${monoClass} ${pnClass(totalRealizedPnl)}`}>
            {formatCurrency(totalRealizedPnl, displayCurrency)}
          </p>
        </div>
        <div className={kpiCardClass} style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Dividends</p>
          <p className={`text-xl font-semibold ${monoClass}`} style={{ color: 'var(--text-primary)' }}>
            {formatCurrency(totalDividends, displayCurrency)}
          </p>
        </div>
        <div className={kpiCardClass} style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Return</p>
          <p className={`text-xl font-semibold ${monoClass} ${pnClass(totalReturnPct ?? 0)}`}>
            {totalReturnPct != null ? `${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)}%` : '—'}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}>
                <th
                  className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
                  onClick={() => handleSort('symbol')}
                >
                  <span className="inline-flex items-center gap-1">
                    Symbol{sortKey === 'symbol' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                  </span>
                </th>
                <th className={headerCellClass}>Shares (B/S)</th>
                <th className={headerCellClass} onClick={() => handleSort('cost')}>
                  <span className="inline-flex items-center gap-1">
                    Total Cost{sortKey === 'cost' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                  </span>
                </th>
                <th className={headerCellClass} onClick={() => handleSort('proceeds')}>
                  <span className="inline-flex items-center gap-1">
                    Proceeds{sortKey === 'proceeds' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                  </span>
                </th>
                <th className={headerCellClass} onClick={() => handleSort('pnl')}>
                  <span className="inline-flex items-center gap-1">
                    Realized P&L{sortKey === 'pnl' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                  </span>
                </th>
                <th className={headerCellClass} onClick={() => handleSort('dividends')}>
                  <span className="inline-flex items-center gap-1">
                    Dividends{sortKey === 'dividends' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                  </span>
                </th>
                <th className={headerCellClass} onClick={() => handleSort('return')}>
                  <span className="inline-flex items-center gap-1">
                    Total Return{sortKey === 'return' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                  </span>
                </th>
                <th className={headerCellClass} onClick={() => handleSort('date')}>
                  <span className="inline-flex items-center gap-1">
                    Held{sortKey === 'date' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((pos, i) => {
                const isEven = i % 2 === 0
                return (
                  <tr
                    key={pos.symbol}
                    className="border-b last:border-0"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: isEven ? 'var(--bg)' : 'var(--bg-sidebar)',
                    }}
                  >
                    <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white">{pos.symbol}</td>
                    <td className={cellClass}>
                      {pos.totalBuyQty} / {pos.totalSellQty}
                    </td>
                    <td className={`${cellClass} text-red-600 dark:text-red-400`}>
                      {formatCurrency(pos.totalCost, pos.currency)}
                    </td>
                    <td className={`${cellClass} text-emerald-600 dark:text-emerald-400`}>
                      {formatCurrency(pos.totalProceeds, pos.currency)}
                    </td>
                    <td className={`${cellClass} font-medium ${pnClass(pos.realizedPnl)}`}>
                      {formatCurrency(pos.realizedPnl, pos.currency)}
                    </td>
                    <td className={cellClass}>
                      {pos.dividends !== 0 ? formatCurrency(pos.dividends, pos.currency) : '—'}
                    </td>
                    <td className={`${cellClass} font-medium ${pnClass(pos.totalReturnPct ?? 0)}`}>
                      {pos.totalReturnPct != null
                        ? `${pos.totalReturnPct >= 0 ? '+' : ''}${pos.totalReturnPct.toFixed(2)}%`
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-500 dark:text-gray-400">
                      {pos.firstBuyDate ? formatDate(pos.firstBuyDate) : '—'}
                      {pos.lastSellDate ? ` – ${formatDate(pos.lastSellDate)}` : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {sorted.length > perPage && (
          <div
            className="flex items-center justify-between px-4 py-2.5 border-t text-xs text-gray-400 dark:text-gray-500"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
          >
            <span>
              Showing {safePage * perPage + 1}–{Math.min((safePage + 1) * perPage, sorted.length)} of {sorted.length}{' '}
              {sorted.length === 1 ? 'position' : 'positions'}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="px-2 py-1 rounded border transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:border-amber-500 hover:text-amber-600"
                style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
              >
                ← Prev
              </button>
              <span className="text-gray-500">
                {safePage + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage === totalPages - 1}
                className="px-2 py-1 rounded border transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:border-amber-500 hover:text-amber-600"
                style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
