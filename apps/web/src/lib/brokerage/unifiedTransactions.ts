import type { BrokerageFundDetail, BrokerageTransaction } from '@lokfi/brokerage-core'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Filters } from '../../pages/transactions/filterTypes'
import { type DbTransaction, db } from '../db/db'
import { toYYYYMMDD } from '../format'

/** Brokerage-specific row types displayed in the unified view */
export type BrokerageRowType =
  | 'BUY'
  | 'SELL'
  | 'DIVIDEND'
  | 'FEE'
  | 'SPLIT'
  | 'RIGHTS'
  | 'OTHER'
  | 'DIVIDEND_TAX'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'CURRENCY_EXCHANGE'
  | 'UNKNOWN'
  | 'REBATE'

/** Display labels for brokerage row types, used in filters and table badges */
export const BROKERAGE_TYPE_LABELS: Record<string, string> = {
  BUY: 'Buy',
  SELL: 'Sell',
  DIVIDEND: 'Dividend',
  FEE: 'Fee',
  SPLIT: 'Split',
  RIGHTS: 'Rights',
  OTHER: 'Other',
  DIVIDEND_TAX: 'Div. Tax',
  TRANSFER_IN: 'Transfer In',
  TRANSFER_OUT: 'Transfer Out',
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal',
  CURRENCY_EXCHANGE: 'Currency Exchange',
  UNKNOWN: 'Unknown',
  REBATE: 'Rebate',
}

/** Common row shape for both bank and brokerage transactions in the UI */
export interface UnifiedTransactionRow {
  id: string
  source: string
  /** ISO-8601 timestamp used for sorting */
  date: string
  description: string
  amount: number
  currency: string
  type: 'BANK' | BrokerageRowType
  symbol?: string
  quantity?: number
  price?: number
  isBank: boolean
  /** Original bank record — present only when `isBank` is true */
  originalBank?: DbTransaction
  /** Original brokerage record — present only when `isBank` is false */
  originalBrokerage?: BrokerageTransaction | BrokerageFundDetail
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function fmtCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}

/** Normalise a date string for reliable lexicographic sorting */
function toComparableDate(dateStr: string): string {
  if (dateStr.length === 10) return `${dateStr}T00:00:00Z`
  return dateStr
}

// ── Mappers ─────────────────────────────────────────────────────────────────

/** Map a bank DbTransaction to a UnifiedTransactionRow */
export function mapBankTransaction(t: DbTransaction): UnifiedTransactionRow {
  return {
    id: t.id,
    source: t.source,
    date: `${t.date}T00:00:00Z`,
    description: t.description,
    amount: t.transactionValue,
    currency: 'SGD',
    type: 'BANK',
    isBank: true,
    originalBank: t,
  }
}

/** Label quantity with the correct unit name based on security type */
function labelQty(qty: number, secType?: string): string {
  if (secType === 'OPT' || secType === 'FUT' || secType === 'FOP') {
    return `${qty} ${qty === 1 ? 'contract' : 'contracts'}`
  }
  return `${qty} ${qty === 1 ? 'share' : 'shares'}`
}

/**
 * Return a secType suffix for non-stock trades so the instrument type is
 * always visible in the description (e.g. "(OPT)" for option trades).
 * Omitted for STK / undefined since those are the common default.
 */
function secTypeTag(secType?: string): string {
  return secType && secType !== 'STK' ? ` (${secType})` : ''
}

/** Map a BrokerageTransaction to one or more UnifiedTransactionRows */
export function mapBrokerageTransaction(t: BrokerageTransaction): UnifiedTransactionRow[] {
  const rows: UnifiedTransactionRow[] = []
  const date = toYYYYMMDD(new Date(t.executedAt))

  const gross = t.quantity * t.price
  const commission = t.commission ?? 0
  const total = t.action === 'BUY' ? -(gross + commission) : gross - commission

  const qtyLabel = labelQty(t.quantity, t.secType)

  rows.push({
    id: `bt-${t.id}`,
    source: t.source,
    date,
    description: `${t.action} ${t.symbol} — ${qtyLabel} @ ${fmtCurrency(t.price, t.currency)}${secTypeTag(t.secType)}`,
    amount: total,
    currency: t.currency,
    type: t.action as UnifiedTransactionRow['type'],
    symbol: t.symbol,
    quantity: t.quantity,
    price: t.price,
    isBank: false,
    originalBrokerage: t,
  })

  if (commission > 0) {
    rows.push({
      id: `bt-${t.id}-fee`,
      source: t.source,
      date,
      description: `Commission Fee — ${fmtCurrency(commission, t.currency)}`,
      amount: -commission,
      currency: t.currency,
      type: 'FEE',
      symbol: t.symbol,
      isBank: false,
      originalBrokerage: t,
    })
  }

  return rows
}

/** Map a BrokerageFundDetail to one or more UnifiedTransactionRows */
export function mapFundDetail(d: BrokerageFundDetail): UnifiedTransactionRow[] {
  const rows: UnifiedTransactionRow[] = []
  const date = d.businessDate.length === 10 ? `${d.businessDate}T00:00:00Z` : d.businessDate

  switch (d.classifiedType) {
    case 'DIVIDEND': {
      rows.push({
        id: `fd-${d.id}`,
        source: d.source,
        date,
        description: `${d.symbol || ''} Dividend — ${fmtCurrency(d.amount, d.currency)}`,
        amount: d.amount,
        currency: d.currency,
        type: 'DIVIDEND',
        symbol: d.symbol,
        isBank: false,
        originalBrokerage: d,
      })
      break
    }

    case 'DIVIDEND_TAX': {
      const isRefund = d.amount > 0
      rows.push({
        id: `fd-${d.id}`,
        source: d.source,
        date,
        description: isRefund
          ? `${d.symbol || ''} Dividend Tax refund (return of capital) — ${fmtCurrency(Math.abs(d.amount), d.currency)}`
          : `${d.symbol || ''} Dividend Tax withheld — ${fmtCurrency(Math.abs(d.amount), d.currency)}`,
        amount: d.amount,
        currency: d.currency,
        type: 'DIVIDEND_TAX',
        symbol: d.symbol,
        isBank: false,
        originalBrokerage: d,
      })
      break
    }

    case 'TRADE': {
      if (d.quantity !== undefined && d.price !== undefined && d.action) {
        // Enriched trade — show as BUY/SELL row with per-share detail.
        // Fund details lack secType so we always say "shares" here.
        const gross = d.quantity * d.price
        const comm = d.commission ?? 0
        const total = d.action === 'BUY' ? -(gross + comm) : gross - comm
        const qtyLabel = `${d.quantity} ${d.quantity === 1 ? 'share' : 'shares'}`

        rows.push({
          id: `fd-${d.id}`,
          source: d.source,
          date,
          description: `${d.action} ${d.symbol || ''} — ${qtyLabel} @ ${fmtCurrency(d.price, d.currency)}`,
          amount: total,
          currency: d.currency,
          type: d.action,
          symbol: d.symbol,
          quantity: d.quantity,
          price: d.price,
          isBank: false,
          originalBrokerage: d,
        })
      } else {
        // Unenriched trade — show as TRADE row with total only
        rows.push({
          id: `fd-${d.id}`,
          source: d.source,
          date,
          description: `Trade ${d.symbol || ''} — ${fmtCurrency(Math.abs(d.amount), d.currency)}`,
          amount: d.amount,
          currency: d.currency,
          type: d.action ?? 'BUY',
          symbol: d.symbol,
          isBank: false,
          originalBrokerage: d,
        })
      }
      break
    }

    case 'FEE': {
      rows.push({
        id: `fd-${d.id}`,
        source: d.source,
        date,
        description: `${d.rawType}${d.symbol ? ` (${d.symbol})` : ''} — ${fmtCurrency(Math.abs(d.amount), d.currency)}`,
        amount: -Math.abs(d.amount), // Fees are always outflows
        currency: d.currency,
        type: 'FEE',
        symbol: d.symbol,
        isBank: false,
        originalBrokerage: d,
      })
      break
    }

    case 'TRANSFER_IN': {
      rows.push({
        id: `fd-${d.id}`,
        source: d.source,
        date,
        description: `Funds Transfer In — ${fmtCurrency(d.amount, d.currency)}`,
        amount: d.amount,
        currency: d.currency,
        type: 'TRANSFER_IN',
        symbol: d.symbol,
        isBank: false,
        originalBrokerage: d,
      })
      break
    }

    case 'TRANSFER_OUT': {
      rows.push({
        id: `fd-${d.id}`,
        source: d.source,
        date,
        description: `Funds Transfer Out — ${fmtCurrency(Math.abs(d.amount), d.currency)}`,
        amount: d.amount, // Already negative from broker
        currency: d.currency,
        type: 'TRANSFER_OUT',
        symbol: d.symbol,
        isBank: false,
        originalBrokerage: d,
      })
      break
    }

    case 'DEPOSIT_WITHDRAWAL': {
      const isDeposit = d.amount > 0
      rows.push({
        id: `fd-${d.id}`,
        source: d.source,
        date,
        description: isDeposit
          ? `Deposit — ${fmtCurrency(d.amount, d.currency)}`
          : `Withdrawal — ${fmtCurrency(Math.abs(d.amount), d.currency)}`,
        amount: d.amount,
        currency: d.currency,
        type: isDeposit ? 'DEPOSIT' : 'WITHDRAWAL',
        symbol: d.symbol,
        isBank: false,
        originalBrokerage: d,
      })
      break
    }

    case 'CURRENCY_EXCHANGE': {
      const fxDesc = d.rawType.includes('Base Currency')
        ? `Currency Conversion (→ Base) — ${fmtCurrency(Math.abs(d.amount), d.currency)}`
        : `Currency Conversion (→ Quotation) — ${fmtCurrency(Math.abs(d.amount), d.currency)}`
      rows.push({
        id: `fd-${d.id}`,
        source: d.source,
        date,
        description: fxDesc,
        amount: d.amount,
        currency: d.currency,
        type: 'CURRENCY_EXCHANGE',
        symbol: d.symbol,
        isBank: false,
        originalBrokerage: d,
      })
      break
    }

    case 'UNKNOWN': {
      rows.push({
        id: `fd-${d.id}`,
        source: d.source,
        date,
        description: `Unclassified (${d.rawType}) — ${fmtCurrency(Math.abs(d.amount), d.currency)}`,
        amount: d.amount,
        currency: d.currency,
        type: 'UNKNOWN',
        symbol: d.symbol,
        isBank: false,
        originalBrokerage: d,
      })
      break
    }

    case 'REBATE': {
      rows.push({
        id: `fd-${d.id}`,
        source: d.source,
        date,
        description: `Rebate (${d.rawType}) — ${fmtCurrency(d.amount, d.currency)}`,
        amount: d.amount,
        currency: d.currency,
        type: 'REBATE',
        isBank: false,
        originalBrokerage: d,
      })
      break
    }

    default: {
      // CORP_ACTION or any future unhandled type — generic row
      rows.push({
        id: `fd-${d.id}`,
        source: d.source,
        date,
        description: `${d.classifiedType}${d.symbol ? ` (${d.symbol})` : ''} — ${fmtCurrency(Math.abs(d.amount), d.currency)}`,
        amount: d.amount,
        currency: d.currency,
        type: d.classifiedType,
        symbol: d.symbol,
        isBank: false,
        originalBrokerage: d,
      })
      break
    }
  }

  return rows
}

// ── Filtering ───────────────────────────────────────────────────────────────

function filterBankRow(row: UnifiedTransactionRow, filters: Filters): boolean {
  if (!row.isBank || !row.originalBank) return false
  const t = row.originalBank

  if (filters.dateFrom && t.date < filters.dateFrom) return false
  if (filters.dateTo && t.date > filters.dateTo) return false
  if (filters.sources.length > 0 && !filters.sources.includes(t.source)) return false
  if (filters.accounts.length > 0 && !filters.accounts.includes(t.accountNo)) return false
  if (filters.type && row.type !== filters.type) return false
  if (filters.categoryId) {
    const resolved = t.manualCategory ?? t.category
    if (filters.categoryId === '__uncategorised__') {
      if (resolved) return false
    } else if (resolved !== filters.categoryId) {
      return false
    }
  }
  return true
}

function filterBrokerageRow(row: UnifiedTransactionRow, filters: Filters): boolean {
  if (row.isBank) return false
  const dateOnly = row.date.slice(0, 10)
  if (filters.dateFrom && dateOnly < filters.dateFrom) return false
  if (filters.dateTo && dateOnly > filters.dateTo) return false
  if (filters.sources.length > 0 && !filters.sources.includes(row.source)) return false
  if (filters.type && row.type !== filters.type) return false
  // Bank-specific filters (accounts, categoryId) don't apply to brokerage rows
  // DIVIDEND_TAX, TRANSFER_IN, REBATE, FEE don't have symbol-specific filtering
  return true
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch and merge bank + brokerage rows according to the current filters.
 *
 * Lazily queries brokerage tables only when `sourceType` is `"all"` or `"brokerage"`.
 * Results are sorted by date descending.
 *
 * @param filters - Current filter state including sourceType, date range, etc.
 * @returns All matching rows and the total count
 */
export async function fetchUnifiedRows(filters: Filters): Promise<{ rows: UnifiedTransactionRow[]; total: number }> {
  const bankRows: UnifiedTransactionRow[] = []
  const brokerageRows: UnifiedTransactionRow[] = []

  // Bank
  if (filters.sourceType === 'all' || filters.sourceType === 'bank') {
    let query = filters.dateFrom
      ? db.transactions.where('date').aboveOrEqual(filters.dateFrom)
      : db.transactions.orderBy('date').reverse()

    if (filters.dateTo) {
      query = query.and((t) => t.date <= filters.dateTo)
    }
    if (filters.sources.length > 0) {
      query = query.and((t) => filters.sources.includes(t.source))
    }
    if (filters.accounts.length > 0) {
      query = query.and((t) => filters.accounts.includes(t.accountNo))
    }

    const allBank = await query.toArray()
    for (const t of allBank) {
      const row = mapBankTransaction(t)
      if (filterBankRow(row, filters)) {
        bankRows.push(row)
      }
    }
  }

  // Brokerage
  if (filters.sourceType === 'all' || filters.sourceType === 'brokerage') {
    // Filled orders that produce standalone BUY/SELL rows
    const txns = await db.brokerageTransactions.toArray()
    for (const t of txns) {
      for (const row of mapBrokerageTransaction(t)) {
        if (filterBrokerageRow(row, filters)) {
          brokerageRows.push(row)
        }
      }
    }

    // Fund details
    const fundDetails = await db.brokerageFundDetails.toArray()
    // Only skip enriched TRADEs when we actually have transactions for the
    // same symbol. If the transaction sync failed (or is empty), enriched
    // TRADEs are the only representation of those trades and must be shown.
    const txnSymbols = new Set(txns.map((t) => t.symbol))
    for (const fd of fundDetails) {
      if (fd.classifiedType === 'TRADE' && fd.quantity !== undefined && fd.price !== undefined && fd.action) {
        if (txnSymbols.has(fd.symbol ?? '')) {
          continue
        }
      }
      for (const row of mapFundDetail(fd)) {
        if (filterBrokerageRow(row, filters)) {
          brokerageRows.push(row)
        }
      }
    }
  }

  const allRows = [...bankRows, ...brokerageRows]
  allRows.sort((a, b) => toComparableDate(b.date).localeCompare(toComparableDate(a.date)))

  return { rows: allRows, total: allRows.length }
}

/**
 * React hook that returns a reactive, paginated slice of unified transactions.
 *
 * Queries `db.transactions` (bank) and `db.brokerageTransactions` +
 * `db.brokerageFundDetails` (brokerage), merges them into a common row shape,
 * sorts by date descending, and slices for pagination.
 *
 * Brokerage tables are queried lazily — only when `sourceType` is `"all"` or
 * `"brokerage"`.
 *
 * @param filters - Current filter state (including `sourceType`)
 * @param pageOffset - Zero-based offset for pagination
 * @param pageSize - Number of rows per page
 * @returns Object with `rows`, `total`, `hasMore`, and `isLoading`
 */
export function useUnifiedTransactions(filters: Filters, pageOffset: number, pageSize: number) {
  return useLiveQuery(
    async () => {
      const { rows, total } = await fetchUnifiedRows(filters)
      const paginated = rows.slice(pageOffset, pageOffset + pageSize)
      const hasMore = pageOffset + paginated.length < total
      return { rows: paginated, total, hasMore, isLoading: false }
    },
    [filters, pageOffset, pageSize],
    { rows: [] as UnifiedTransactionRow[], total: 0, hasMore: false, isLoading: true }
  )
}
