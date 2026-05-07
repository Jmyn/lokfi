import type { BrokeragePosition } from '@lokfi/brokerage-core'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, ChevronRight, Info } from 'lucide-react'
import { useMemo, useState } from 'react'
import { db } from '../../lib/db/db'
import { convertAmount } from '../../lib/fx/convert'
import type { CurrencyOption } from './currencyPreference'
import { getAdjustedMetrics } from './holdingCalculations'
import type { HoldingMetrics } from './holdingCalculations'

interface HoldingsTabProps {
  preferredCurrency: CurrencyOption
  fxRates: Record<string, number> | null
  fxLastUpdated: string | null
  fxError: string | null
}

interface PositionRow {
  position: BrokeragePosition
  mktPrice: number
  mktValue: number
  pnl: number
  isEstimated: boolean
  totalOptionPremiums: number
  totalDividends: number
  adjCostBasisPerShare: number | null
  totalReturnPct: number | null
  realisedPnl: number
  unrealisedPnl: number
  totalPnl: number
  isIncomplete: boolean
  diagnostics: string[]
}

interface HoldingDetailRowProps {
  row: PositionRow
  variant?: 'stock' | 'derivative'
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

function HoldingDetailRow({ row, variant = 'stock' }: HoldingDetailRowProps) {
  const { position } = row
  const isDerivative = position.secType != null && DERIVATIVE_TYPES.has(position.secType)
  const costBasis = position.quantity * position.avgCost
  const extData = useLiveQuery(
    () => db.brokeragePositionExtensions.where('positionId').equals(position.id).toArray(),
    [position.id]
  )

  function getExt(key: string): string | null {
    const rec = extData?.find((e) => e.key === key)
    if (!rec) return null
    try {
      return JSON.parse(rec.value)
    } catch {
      return rec.value
    }
  }

  const dayLow = getExt('dayLow')
  const dayHigh = getExt('dayHigh')
  const week52Low = getExt('week52Low')
  const week52High = getExt('week52High')

  return (
    <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
      <td colSpan={variant === 'stock' ? 13 : 7} className="px-4 py-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {/* Left column */}
          <div className="space-y-2">
            <div className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider font-semibold mb-1">
              Details
            </div>
            {position.name && (
              <div className="flex gap-2">
                <span className="text-gray-500 dark:text-gray-400 w-28 shrink-0">Full Name</span>
                <span className="text-gray-900 dark:text-white">{position.name}</span>
              </div>
            )}
            {isDerivative ? (
              <div className="flex gap-2">
                <span className="text-gray-500 dark:text-gray-400 w-28 shrink-0">Total Premium</span>
                <span className="text-gray-900 dark:text-white font-mono tabular-nums">
                  {formatCurrency(costBasis, position.currency)}
                </span>
              </div>
            ) : (
              <div className="flex gap-2">
                <span className="text-gray-500 dark:text-gray-400 w-28 shrink-0">Raw Cost Basis</span>
                <span className="text-gray-900 dark:text-white font-mono tabular-nums">
                  {formatCurrency(costBasis, position.currency)}
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="text-gray-500 dark:text-gray-400 w-28 shrink-0">Adjusted Cost</span>
              <span className="text-gray-900 dark:text-white font-mono tabular-nums">
                {(() => {
                  const rawCostBasis = position.quantity * position.avgCost
                  const adjTotal = rawCostBasis - row.totalOptionPremiums - row.totalDividends
                  return row.adjCostBasisPerShare != null
                    ? `${formatCurrency(adjTotal, position.currency)} (${formatCurrency(row.adjCostBasisPerShare, position.currency)}/sh)`
                    : '—'
                })()}
              </span>
            </div>
          </div>

          {/* Right column — price context only for stocks */}
          <div className="space-y-2">
            <div className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider font-semibold mb-1">
              {isDerivative ? 'Info' : 'Price Context'}
            </div>
            {!isDerivative && (
              <>
                <div className="flex gap-2">
                  <span className="text-gray-500 dark:text-gray-400 w-28 shrink-0">Day Range</span>
                  <span className="text-gray-900 dark:text-white font-mono tabular-nums">
                    {dayLow && dayHigh
                      ? `${formatCurrency(Number.parseFloat(dayLow), position.currency)} – ${formatCurrency(Number.parseFloat(dayHigh), position.currency)}`
                      : '—'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 dark:text-gray-400 w-28 shrink-0">52W Range</span>
                  <span className="text-gray-900 dark:text-white font-mono tabular-nums">
                    {week52Low && week52High
                      ? `${formatCurrency(Number.parseFloat(week52Low), position.currency)} – ${formatCurrency(Number.parseFloat(week52High), position.currency)}`
                      : '—'}
                  </span>
                </div>
              </>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-2">
              <Link
                to="/transactions"
                search={{ sourceType: 'brokerage', type: position.symbol }}
                className="text-xs font-medium px-3 py-1 rounded border transition-colors hover:border-amber-500 hover:text-amber-600"
                style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
              >
                View Transactions
              </Link>
              <Link
                to="/transactions"
                search={{ sourceType: 'brokerage' }}
                className="text-xs font-medium px-3 py-1 rounded border transition-colors hover:border-amber-500 hover:text-amber-600"
                style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
              >
                View Corp Actions
              </Link>
            </div>
          </div>
        </div>

        {/* Diagnostics: surface data quality concerns */}
        {row.diagnostics.length > 0 && (
          <div className="mt-3 pt-3 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
            <div className="text-amber-600 dark:text-amber-400 text-xs uppercase tracking-wider font-semibold mb-1">
              Diagnostics
            </div>
            {row.diagnostics.map((msg, i) => (
              <div key={i} className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {msg}
              </div>
            ))}
          </div>
        )}
      </td>
    </tr>
  )
}

function HoldingsTable({
  positions,
  preferredCurrency,
  fxRates,
  variant = 'stock',
}: {
  positions: PositionRow[]
  preferredCurrency: CurrencyOption
  fxRates: Record<string, number> | null
  variant?: 'stock' | 'derivative'
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Pagination
  const [page, setPage] = useState(0)
  const perPage = 100

  // Sorting
  type HoldSortKey =
    | 'symbol'
    | 'qty'
    | 'avgCost'
    | 'mktPrice'
    | 'mktValue'
    | 'pnl'
    | 'premium'
    | 'dividend'
    | 'adjCost'
    | 'totalReturn'
    | 'realised'
    | 'totalPnl'
  const [sortKey, setSortKey] = useState<HoldSortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function handleSort(key: HoldSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'symbol' ? 'asc' : 'desc')
    }
    setPage(0)
  }

  // Sorted data
  const sortedPositions = (() => {
    if (!sortKey) return positions
    return [...positions].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'symbol':
          cmp = a.position.symbol.localeCompare(b.position.symbol)
          break
        case 'qty':
          cmp = a.position.quantity - b.position.quantity
          break
        case 'avgCost':
          cmp = a.position.avgCost - b.position.avgCost
          break
        case 'mktPrice':
          cmp = a.mktPrice - b.mktPrice
          break
        case 'mktValue':
          cmp = a.mktValue - b.mktValue
          break
        case 'pnl':
          cmp = a.pnl - b.pnl
          break
        case 'premium':
          cmp = a.totalOptionPremiums - b.totalOptionPremiums
          break
        case 'dividend':
          cmp = a.totalDividends - b.totalDividends
          break
        case 'adjCost':
          cmp = (a.adjCostBasisPerShare ?? 0) - (b.adjCostBasisPerShare ?? 0)
          break
        case 'totalReturn':
          cmp = (a.totalReturnPct ?? 0) - (b.totalReturnPct ?? 0)
          break
        case 'realised':
          cmp = a.realisedPnl - b.realisedPnl
          break
        case 'totalPnl':
          cmp = a.totalPnl - b.totalPnl
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  })()

  const totalPages = Math.max(1, Math.ceil(sortedPositions.length / perPage))
  const safePage = Math.min(page, totalPages - 1)
  const paginatedPositions = sortedPositions.slice(safePage * perPage, (safePage + 1) * perPage)

  const showConverted = preferredCurrency !== 'Original' && fxRates != null
  const prefCurrency = preferredCurrency === 'Original' ? (positions[0]?.position.currency ?? 'USD') : preferredCurrency

  function pnClass(pnl: number) {
    if (pnl > 0) return 'text-emerald-600 dark:text-emerald-400'
    if (pnl < 0) return 'text-red-600 dark:text-red-400'
    return 'text-gray-500 dark:text-gray-400'
  }

  const isDerivative = variant === 'derivative'

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}>
            <th className="w-8 px-3 py-2.5" />
            <th
              className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
              onClick={() => handleSort('symbol')}
              title="Ticker symbol"
            >
              <span className="inline-flex items-center gap-1">
                {isDerivative ? 'Underlying' : 'Symbol'}
                {sortKey === 'symbol' && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
              </span>
            </th>
            <th
              className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
              onClick={() => handleSort('qty')}
              title={isDerivative ? 'Number of contracts held' : 'Number of shares currently held'}
            >
              <span className="inline-flex items-center gap-1">
                {isDerivative ? 'Contracts' : 'Qty'}
                {sortKey === 'qty' && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
              </span>
            </th>
            <th
              className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
              onClick={() => handleSort('avgCost')}
              title={
                isDerivative
                  ? 'Broker-reported average price per contract'
                  : 'Broker-reported average cost per share (split-adjusted)'
              }
            >
              <span className="inline-flex items-center gap-1">
                {isDerivative ? 'Avg Price' : 'Avg Cost'}
                {sortKey === 'avgCost' && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
              </span>
            </th>
            <th
              className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
              onClick={() => handleSort('mktPrice')}
              title={isDerivative ? 'Last traded price per contract' : 'Last traded market price per share'}
            >
              <span className="inline-flex items-center gap-1">
                {isDerivative ? 'Last Price' : 'Mkt Price'}
                {sortKey === 'mktPrice' && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
              </span>
            </th>
            <th
              className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
              onClick={() => handleSort('mktValue')}
              title={
                isDerivative
                  ? 'Market value = contracts × last price × multiplier'
                  : 'Market value = qty × market price'
              }
            >
              <span className="inline-flex items-center gap-1">
                Mkt Value
                {sortKey === 'mktValue' && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
              </span>
            </th>
            <th
              className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
              onClick={() => handleSort('pnl')}
               title="Unrealised P&L on current position"
            >
              <span className="inline-flex items-center gap-1">
                Unreal. P&L
                {sortKey === 'pnl' && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
              </span>
            </th>
            {!isDerivative && (
              <>
                <th
                  className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
                  onClick={() => handleSort('realised')}
                  title="Realised gain/loss from closed stock sales only (excl. dividends & premiums)"
                >
                  <span className="inline-flex items-center gap-1">
                    Realised P&L
                    {sortKey === 'realised' && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </span>
                </th>
                <th
                  className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
                  onClick={() => handleSort('premium')}
                   title="Net option premiums received = sold premiums − bought-back premiums (covers closed trades when transaction history is available)"
                >
                  <span className="inline-flex items-center gap-1">
                    Prem Recv'd
                    {sortKey === 'premium' && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </span>
                </th>
                <th
                  className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
                  onClick={() => handleSort('dividend')}
                  title="Net dividends received (lifetime) = gross dividends − withholding tax. Tax reversals are capped at prior withholding."
                >
                  <span className="inline-flex items-center gap-1">
                    Div Recv'd
                    {sortKey === 'dividend' && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </span>
                </th>
                <th
                  className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
                  onClick={() => handleSort('adjCost')}
                  title="Adjusted cost per share = (raw cost basis − premiums − dividends) ÷ qty"
                >
                  <span className="inline-flex items-center gap-1">
                    Adj Cost/Sh
                    {sortKey === 'adjCost' && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </span>
                </th>
                <th
                  className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
                  onClick={() => handleSort('totalPnl')}
                  title="All-time total = stock sale P&L + premiums + dividends + unrealised P&L"
                >
                  <span className="inline-flex items-center gap-1">
                    Total P&L
                    {sortKey === 'totalPnl' && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </span>
                </th>
                <th
                  className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
                  onClick={() => handleSort('totalReturn')}
                   title="Total return % = (Mkt Value + Realised P&L + Prem Recv'd + Div Recv'd − cost basis) ÷ cost basis × 100, where cost basis = Avg Cost × Qty"
                >
                  <span className="inline-flex items-center gap-1">
                    Total Return
                    {sortKey === 'totalReturn' && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </span>
                </th>
              </>
            )}
          </tr>
        </thead>
        {paginatedPositions.map((row, i) => {
          const { position } = row
          const isEven = i % 2 === 0
          const isExpanded = expandedIds.has(position.id)
          const isShort = position.quantity < 0

          return (
            <tbody key={position.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
              <tr
                className="cursor-pointer transition-colors"
                style={{
                  backgroundColor: isEven ? 'var(--bg)' : 'var(--bg-sidebar)',
                }}
                onClick={() => toggleExpand(position.id)}
              >
                <td className="px-3 py-2.5 text-gray-400">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </td>
                <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white">
                  <span className="flex items-center gap-1.5">
                    {position.symbol}
                    {isDerivative && (
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          isShort
                            ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                            : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                        }`}
                      >
                        {isShort ? 'Short' : 'Long'}
                      </span>
                    )}
                    {row.isEstimated && (
                      <span title="Estimated using avg cost" className="ml-1 text-amber-500">
                        *
                      </span>
                    )}
                  </span>
                  {isDerivative &&
                    (() => {
                      const info = parseOptionIdentifier(position.identifier)
                      if (!info) return null
                      const expiryDate = new Date(
                        Number(`20${info.expiry.slice(6)}`),
                        Number(info.expiry.slice(0, 2)) - 1,
                        Number(info.expiry.slice(3, 5))
                      )
                      const label = expiryDate.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: '2-digit',
                      })
                      return (
                        <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                          {label} {info.type} ${info.strike.toFixed(info.strike % 1 === 0 ? 0 : 1)}
                        </div>
                      )
                    })()}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                  {isDerivative ? Math.abs(position.quantity) : position.quantity}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                  {formatCurrency(position.avgCost, position.currency)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                  {formatCurrency(row.mktPrice, position.currency)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                  <div>
                    {showConverted
                      ? formatCurrency(
                          convertAmount(row.mktValue, position.currency, prefCurrency, fxRates!),
                          prefCurrency
                        )
                      : formatCurrency(row.mktValue, position.currency)}
                    {showConverted && (
                      <div className="text-xs text-gray-400 font-normal">
                        {formatCurrency(row.mktValue, position.currency)}
                      </div>
                    )}
                  </div>
                </td>
                <td className={`px-3 py-2.5 text-right font-mono tabular-nums font-medium ${pnClass(row.pnl)}`}>
                  <div>
                    {showConverted
                      ? formatCurrency(convertAmount(row.pnl, position.currency, prefCurrency, fxRates!), prefCurrency)
                      : formatCurrency(row.pnl, position.currency)}
                    {showConverted && (
                      <div className="text-xs font-normal">{formatCurrency(row.pnl, position.currency)}</div>
                    )}
                  </div>
                </td>
                {!isDerivative && (
                  <>
                    <td
                      className={`px-3 py-2.5 text-right font-mono tabular-nums font-medium ${pnClass(row.realisedPnl)}`}
                    >
                      {row.realisedPnl !== 0 || !row.isIncomplete
                        ? formatCurrency(row.realisedPnl, position.currency)
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                      {row.totalOptionPremiums > 0 ? formatCurrency(row.totalOptionPremiums, position.currency) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                      {row.totalDividends > 0 ? formatCurrency(row.totalDividends, position.currency) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                      {row.adjCostBasisPerShare != null
                        ? formatCurrency(row.adjCostBasisPerShare, position.currency)
                        : '—'}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono tabular-nums font-medium ${pnClass(row.totalPnl)}`}
                    >
                      {formatCurrency(row.totalPnl, position.currency)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono tabular-nums font-medium ${pnClass(row.totalReturnPct ?? 0)}`}
                    >
                      {row.totalReturnPct != null
                        ? `${row.totalReturnPct >= 0 ? '+' : ''}${row.totalReturnPct.toFixed(2)}%`
                        : '—'}
                    </td>
                  </>
                )}
              </tr>
              {isExpanded && <HoldingDetailRow row={row} variant={variant} />}
            </tbody>
          )
        })}
      </table>
      {sortedPositions.length > perPage && (
        <div
          className="flex items-center justify-between px-4 py-2.5 border-t text-xs text-gray-400 dark:text-gray-500"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
        >
          <span>
            Showing {safePage * perPage + 1}–{Math.min((safePage + 1) * perPage, sortedPositions.length)} of{' '}
            {sortedPositions.length} {sortedPositions.length === 1 ? 'position' : 'positions'}
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
  )
}

/** Parse OCC option identifier into human-readable contract info */
function parseOptionIdentifier(
  identifier: string | undefined
): { expiry: string; type: string; strike: number } | null {
  if (!identifier) return null
  // OCC format: <symbol><2 spaces><YYMMDD><C|P><strike_padded_zero*1000>
  const match = identifier.match(/\s{2,}(\d{2})(\d{2})(\d{2})([CP])(\d{5,8})$/)
  if (!match) return null
  const [, yy, mm, dd, type, strikeStr] = match
  const strike = Number.parseInt(strikeStr, 10) / 1000
  const expiry = `${mm}/${dd}/${yy}`
  return { expiry, type, strike }
}

/** Stock-like security types shown in the main holdings section */
const STOCK_LIKE_TYPES = new Set(['STK', 'CASH', 'FUND', 'MLEG'])
/** Derivative types shown in the derivatives section */
const DERIVATIVE_TYPES = new Set(['OPT', 'FUT', 'FOP', 'WAR'])

function isStockLike(p: BrokeragePosition): boolean {
  if (p.secType == null) return true // default / legacy
  return STOCK_LIKE_TYPES.has(p.secType)
}

function isDerivative(p: BrokeragePosition): boolean {
  if (p.secType == null) return false
  return DERIVATIVE_TYPES.has(p.secType)
}

function toRow(position: BrokeragePosition, metrics?: HoldingMetrics): PositionRow {
  const mktValue = position.marketValue ?? position.quantity * position.avgCost
  // For derivatives, divide by multiplier so Last Price is per-share (consistent
  // with avgCost). Tiger reports marketValue as total contract value, so for
  // options with multiplier=100, mktValue/qty = $165/contract = $1.65/share.
  const mult = isDerivative(position) && position.multiplier ? position.multiplier : 1
  const mktPrice = position.marketValue ? position.marketValue / position.quantity / mult : position.avgCost
  // Use authoritative unrealizedPnl from the API when available.
  const pnl = position.unrealizedPnl ?? (mktPrice - position.avgCost) * position.quantity * mult
  const isEstimated = !position.marketValue
  return {
    position,
    mktPrice,
    mktValue,
    pnl,
    isEstimated,
    totalOptionPremiums: metrics?.totalOptionPremiums ?? 0,
    totalDividends: metrics?.totalDividends ?? 0,
    adjCostBasisPerShare: metrics?.adjCostBasisPerShare ?? null,
    totalReturnPct: metrics?.totalReturnPct ?? null,
    realisedPnl: metrics?.realisedStockPnl ?? 0,
    unrealisedPnl: metrics?.unrealisedPnl ?? pnl,
    totalPnl: metrics?.totalPnl ?? pnl,
    isIncomplete: metrics?.isIncomplete ?? false,
    diagnostics: metrics?.diagnostics ?? [],
  }
}

function CollapsibleCurrencyGroup({
  currency,
  label,
  rows,
  preferredCurrency,
  fxRates,
  defaultExpanded,
  variant = 'stock',
}: {
  currency: string
  label: string
  rows: PositionRow[]
  preferredCurrency: CurrencyOption
  fxRates: Record<string, number> | null
  defaultExpanded: boolean
  variant?: 'stock' | 'derivative'
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div>
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        style={{
          backgroundColor: 'var(--bg)',
          borderBottom: '2px solid var(--border)',
          borderTop: '1px solid var(--border)',
        }}
      >
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold text-white"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {currency}
        </span>
        {label}
        <span className="ml-auto text-xs font-normal text-gray-400">
          {rows.length} {rows.length === 1 ? 'position' : 'positions'}
        </span>
      </button>
      {expanded && (
        <HoldingsTable positions={rows} preferredCurrency={preferredCurrency} fxRates={fxRates} variant={variant} />
      )}
    </div>
  )
}

/** Render a list of currency-grouped sections for a set of position rows */
function PositionSection({
  title,
  rows,
  preferredCurrency,
  fxRates,
  defaultExpanded,
  variant = 'stock',
}: {
  title: string
  rows: PositionRow[]
  preferredCurrency: CurrencyOption
  fxRates: Record<string, number> | null
  defaultExpanded: boolean
  variant?: 'stock' | 'derivative'
  emptyMessage?: string
}) {
  if (rows.length === 0) return null

  // Group by currency
  const grouped = rows.reduce<Record<string, PositionRow[]>>((acc, row) => {
    const cur = row.position.currency
    if (!acc[cur]) acc[cur] = []
    acc[cur].push(row)
    return acc
  }, {})

  const sortedCurrencies = Object.keys(grouped).sort()

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      {sortedCurrencies.map((cur) => (
        <CollapsibleCurrencyGroup
          key={cur}
          currency={cur}
          label={title}
          rows={grouped[cur]}
          preferredCurrency={preferredCurrency}
          fxRates={fxRates}
          defaultExpanded={defaultExpanded}
          variant={variant}
        />
      ))}
    </div>
  )
}

export function HoldingsTab({ preferredCurrency, fxRates, fxLastUpdated, fxError }: HoldingsTabProps) {
  const [search, setSearch] = useState('')

  const allPositions = useLiveQuery(() => db.brokeragePositions.toArray(), [])

  // Fund detail records for dividends and TRADE (used as fallback when
  // transaction buy history is incomplete — fund details accumulate across syncs)
  const fundDetails =
    useLiveQuery(
      () => db.brokerageFundDetails.where('classifiedType').anyOf(['TRADE', 'DIVIDEND', 'DIVIDEND_TAX']).toArray(),
      []
    ) ?? []

  // All brokerage transactions for option premium calculation (includes secType for
  // filtering option vs. stock trades, covering both open and closed positions)
  const allTransactions = useLiveQuery(() => db.brokerageTransactions.toArray(), []) ?? []

  // Option positions for premium calculation (fallback when transactions lack secType)
  const optionPositions = useMemo(() => (allPositions ?? []).filter((p) => p.secType === 'OPT'), [allPositions])

  // Precompute holding metrics for each stock position
  const metricsByPositionId = useMemo(() => {
    const map = new Map<string, HoldingMetrics>()
    for (const p of allPositions ?? []) {
      if (isStockLike(p)) {
        map.set(p.id, getAdjustedMetrics(p, optionPositions, fundDetails, allTransactions))
      }
    }
    return map
  }, [allPositions, optionPositions, fundDetails, allTransactions])

  // Split into stock-like and derivatives
  const stockRows: PositionRow[] = []
  const derivativeRows: PositionRow[] = []

  for (const p of allPositions ?? []) {
    const metrics = metricsByPositionId.get(p.id)
    const row = toRow(p, metrics)
    if (isStockLike(p)) {
      stockRows.push(row)
    } else if (isDerivative(p)) {
      derivativeRows.push(row)
    }
    // Unknown secType falls through (shouldn't happen with current Tiger data)
  }

  // Apply search filter to BOTH sections
  function matchesSearch(row: PositionRow): boolean {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return row.position.symbol.toLowerCase().includes(q) || (row.position.name ?? '').toLowerCase().includes(q)
  }

  const filteredStock = stockRows.filter(matchesSearch)
  const filteredDerivatives = derivativeRows.filter(matchesSearch)

  const showConverted = preferredCurrency !== 'Original' && fxRates != null

  // ── Empty / loading states ─────────────────────────────────────────────

  if (!allPositions) {
    return <div className="flex items-center justify-center py-12 text-gray-400">Loading...</div>
  }

  if (allPositions.length === 0) {
    return (
      <div
        className="text-center p-8 rounded-xl border"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <p className="text-gray-600 dark:text-gray-400 mb-4">No holdings yet. Sync your account.</p>
        <Link
          to="/settings/brokerage"
          className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full text-white transition-colors"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <Info size={14} />
          Brokerage Settings
        </Link>
      </div>
    )
  }

  if (stockRows.length === 0 && derivativeRows.length === 0) {
    // All positions have an unexpected secType (shouldn't happen)
    return (
      <div
        className="text-center p-8 rounded-xl border"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <p className="text-gray-600 dark:text-gray-400 mb-2">No recognizable holdings found.</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
          Your account has positions with unknown security types. Try syncing again.
        </p>
        <Link
          to="/settings/brokerage"
          className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full text-white transition-colors"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <Info size={14} />
          Brokerage Settings
        </Link>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* FX status bar */}
      {showConverted && fxLastUpdated && (
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 px-1">
          <span>
            FX rates as of {new Date(fxLastUpdated).toLocaleString()} · displaying in{' '}
            <span className="font-medium text-gray-600 dark:text-gray-300">{preferredCurrency}</span>
          </span>
          {fxError && <span className="text-amber-600 dark:text-amber-400">· FX error: {fxError}</span>}
        </div>
      )}
      {showConverted && fxError && (
        <div className="text-xs text-amber-600 dark:text-amber-400 px-1">
          FX rates unavailable · showing original currency values · {fxError}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by symbol or name..."
          className="w-full text-sm border rounded-lg px-4 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          style={{ borderColor: 'var(--border)' }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            ×
          </button>
        )}
      </div>

      {/* No search results */}
      {search.trim() && filteredStock.length === 0 && filteredDerivatives.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
          No results for &quot;{search}&quot;
        </div>
      )}

      {/* Stocks section */}
      <PositionSection
        title="Holdings"
        rows={filteredStock}
        preferredCurrency={preferredCurrency}
        fxRates={fxRates}
        defaultExpanded={true}
      />

      {/* Derivatives section (options, futures, etc.) */}
      <PositionSection
        title="Derivatives"
        rows={filteredDerivatives}
        preferredCurrency={preferredCurrency}
        fxRates={fxRates}
        defaultExpanded={false}
        variant="derivative"
      />
    </div>
  )
}
