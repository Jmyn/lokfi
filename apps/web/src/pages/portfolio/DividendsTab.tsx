import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CATEGORY_PALETTE } from '../../lib/charts/chartPalette'
import { LEGEND_STYLE, TOOLTIP_STYLE } from '../../lib/charts/chartTheme'
import { db } from '../../lib/db/db'
import { convertAmount } from '../../lib/fx/convert'
import type { CurrencyOption } from './currencyPreference'

interface DividendsTabProps {
  preferredCurrency: CurrencyOption
  fxRates: Record<string, number> | null
  fxLastUpdated: string | null
  fxError: string | null
}

type FilterMode = 'all' | 'paid' | 'estimated'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
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

function getYearOptions(): number[] {
  const currentYear = new Date().getFullYear()
  return Array.from({ length: 5 }, (_, i) => currentYear - i)
}

export function DividendsTab({ preferredCurrency, fxRates, fxLastUpdated }: DividendsTabProps) {
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())
  const [filterMode, setFilterMode] = useState<FilterMode>('all')

  const dividends =
    useLiveQuery(
      () => db.brokerageFundDetails.where('classifiedType').anyOf(['DIVIDEND', 'DIVIDEND_TAX']).toArray(),
      []
    ) ?? []

  const positions = useLiveQuery(() => db.brokeragePositions.toArray(), []) ?? []

  // Filtered dividends for selected year and filter mode
  const filteredDividends = useMemo(() => {
    return dividends.filter((div) => {
      // Determine the effective year based on payDate or appliedAt
      const dateStr = div.businessDate
      if (!dateStr) return false
      const date = new Date(dateStr)
      const year = date.getFullYear()
      if (year !== selectedYear) return false

      // Apply filter mode
      if (filterMode === 'paid') {
        return div.businessDate !== null && div.businessDate !== undefined && new Date(div.businessDate) <= new Date()
      }
      if (filterMode === 'estimated') {
        return !div.businessDate || new Date(div.businessDate) > new Date()
      }
      return true
    })
  }, [dividends, selectedYear, filterMode])

  // YTD Total — each dividend converted individually when a specific currency is selected
  const ytdTotal = useMemo(() => {
    if (preferredCurrency === 'Original' || !fxRates) {
      return filteredDividends.reduce((sum, div) => sum + (div.amount ?? 0), 0)
    }
    return filteredDividends.reduce((sum, div) => {
      return sum + convertAmount(div.amount ?? 0, div.currency || 'USD', preferredCurrency, fxRates)
    }, 0)
  }, [filteredDividends, preferredCurrency, fxRates])

  // Months with at least one dividend in selected year
  const monthsWithDividends = useMemo(() => {
    const months = new Set<number>()
    filteredDividends.forEach((div) => {
      const dateStr = div.businessDate
      if (dateStr) {
        const date = new Date(dateStr)
        months.add(date.getMonth())
      }
    })
    return months.size
  }, [filteredDividends])

  // Monthly average
  const monthlyAverage = monthsWithDividends > 0 ? ytdTotal / monthsWithDividends : 0

  // Cost basis: sum of avgCost * quantity for positions that have dividends — each converted individually
  const totalCostBasis = useMemo(() => {
    const dividendSymbols = new Set(filteredDividends.map((d) => d.symbol))
    if (preferredCurrency === 'Original' || !fxRates) {
      return positions
        .filter((p) => dividendSymbols.has(p.symbol))
        .reduce((sum, p) => sum + (p.avgCost ?? 0) * (p.quantity ?? 0), 0)
    }
    return positions
      .filter((p) => dividendSymbols.has(p.symbol))
      .reduce((sum, p) => {
        const cost = (p.avgCost ?? 0) * (p.quantity ?? 0)
        return sum + convertAmount(cost, p.currency || 'USD', preferredCurrency, fxRates)
      }, 0)
  }, [positions, filteredDividends, preferredCurrency, fxRates])

  // Yield on Cost: annualized dividends / cost basis
  const yieldOnCost = useMemo(() => {
    if (totalCostBasis === 0) return null
    const currentMonth = new Date().getMonth() + 1
    const annualized = ytdTotal * (12 / currentMonth)
    return annualized / totalCostBasis
  }, [ytdTotal, totalCostBasis])

  // Monthly chart data grouped by currency
  const chartData = useMemo(() => {
    const buckets: Array<Record<string, number | string>> = []
    for (let i = 0; i < 12; i++) {
      buckets[i] = { month: MONTH_NAMES[i] }
    }

    filteredDividends.forEach((div) => {
      const dateStr = div.businessDate
      if (!dateStr) return
      const date = new Date(dateStr)
      const monthIdx = date.getMonth()
      const currency = div.currency ?? 'USD'
      const current = (buckets[monthIdx][currency] as number | undefined) ?? 0
      buckets[monthIdx][currency] = current + (div.amount ?? 0)
    })

    return Object.values(buckets)
  }, [filteredDividends])

  // Unique currencies in chart data for legend
  const chartCurrencies = useMemo(() => {
    const set = new Set<string>()
    filteredDividends.forEach((d) => {
      if (d.currency) set.add(d.currency)
    })
    return Array.from(set)
  }, [filteredDividends])

  // Sorted dividends for table
  const sortedDividends = useMemo(() => {
    return [...filteredDividends].sort((a, b) => {
      const dateA = a.businessDate ?? ''
      const dateB = b.businessDate ?? ''
      return dateB.localeCompare(dateA)
    })
  }, [filteredDividends])

  const yearOptions = useMemo(() => getYearOptions(), [])

  const displayCurrency =
    preferredCurrency === 'Original' ? (filteredDividends[0]?.currency ?? 'USD') : preferredCurrency

  const kpiCardClass = 'rounded-xl border p-5'
  const monoClass = 'font-mono tabular-nums'

  return (
    <div className="flex flex-col gap-6">
      {/* Year selector */}
      <div className="flex items-center justify-between">
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="text-sm border rounded-xl px-3 py-2"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg-sidebar)',
            color: 'var(--text-primary)',
          }}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        {fxLastUpdated && <span className="text-xs text-gray-400">FX rates: {fxLastUpdated}</span>}
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {/* YTD Total */}
        <div className={kpiCardClass} style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">YTD Total</p>
          <p className={`text-xl font-semibold ${monoClass}`} style={{ color: 'var(--text-primary)' }}>
            {formatCurrency(ytdTotal, displayCurrency)}
          </p>
        </div>

        {/* Monthly Average */}
        <div className={kpiCardClass} style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Monthly Avg</p>
          <p className={`text-xl font-semibold ${monoClass}`} style={{ color: 'var(--text-primary)' }}>
            {formatCurrency(monthlyAverage, displayCurrency)}
          </p>
        </div>

        {/* Yield on Cost */}
        <div className={kpiCardClass} style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">Yield on Cost</p>
            {/* Info tooltip */}
            <div className="relative group">
              <svg
                className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 cursor-help"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                <div
                  className="text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--bg-sidebar)',
                    color: 'var(--text-secondary, #6b7280)',
                    border: '1px solid var(--border)',
                  }}
                >
                  Annualized dividends ÷ total cost basis
                  <br />
                  (YTD × 12 ÷ month ÷ cost basis)
                  <div
                    className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
                    style={{
                      backgroundColor: 'var(--bg-sidebar)',
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
          <p className={`text-xl font-semibold ${monoClass}`} style={{ color: 'var(--text-primary)' }}>
            {yieldOnCost !== null ? `${(yieldOnCost * 100).toFixed(2)}%` : 'N/A'}
          </p>
        </div>
      </div>

      {/* Bar chart */}
      {chartCurrencies.length > 0 ? (
        <div
          className="rounded-xl border p-4"
          style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fontFamily: 'DM Mono', fill: '#9ca3af' }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fontFamily: 'DM Mono', fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: number, name: string) => [formatCurrency(value, name), name]}
              />
              <Legend wrapperStyle={{ ...LEGEND_STYLE, paddingTop: '12px' }} iconType="square" />
              {chartCurrencies.map((curr, idx) => (
                <Bar key={curr} dataKey={curr} fill={CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length]} stackId="stack" />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {/* Filter toggle */}
      <div className="flex items-center gap-2">
        {(['all', 'paid', 'estimated'] as FilterMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setFilterMode(mode)}
            className="text-sm px-3 py-1.5 rounded-full border transition-colors capitalize"
            style={{
              backgroundColor: filterMode === mode ? 'var(--accent)' : 'transparent',
              borderColor: 'var(--border)',
              color: filterMode === mode ? 'white' : 'var(--text-primary)',
            }}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Table */}
      {sortedDividends.length > 0 ? (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-sidebar)' }}>
                {['Symbol', 'Date', 'Amount', 'Currency', 'Type'].map((col) => (
                  <th
                    key={col}
                    className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 border-b"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedDividends.map((div) => (
                <tr key={div.id} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {div.symbol}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatDate(div.businessDate)}</td>
                  <td className={`px-4 py-3 ${monoClass}`} style={{ color: 'var(--text-primary)' }}>
                    {formatCurrency(div.amount, div.currency)}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{div.currency}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {div.classifiedType === 'DIVIDEND_TAX' ? 'Dividend Tax' : 'Dividend'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="text-center py-12 rounded-xl border"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
        >
          <p className="text-gray-500 dark:text-gray-400">No dividends recorded yet.</p>
        </div>
      )}
    </div>
  )
}
