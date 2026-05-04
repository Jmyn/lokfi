import type { BrokerageCorpAction, BrokerageTransaction } from '@lokfi/brokerage-core'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Filters } from '../../pages/transactions/filterTypes'
import { type DbTransaction, db } from '../db/db'

/** Brokerage-specific row types displayed in the unified view */
export type BrokerageRowType = 'BUY' | 'SELL' | 'DIVIDEND' | 'FEE' | 'SPLIT' | 'RIGHTS' | 'OTHER' | 'CORP ACTION'

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
  originalBrokerage?: BrokerageTransaction | BrokerageCorpAction
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

/** Map a BrokerageTransaction to one or more UnifiedTransactionRows */
export function mapBrokerageTransaction(t: BrokerageTransaction): UnifiedTransactionRow[] {
  const rows: UnifiedTransactionRow[] = []
  const date = t.executedAt

  const gross = t.quantity * t.price
  const commission = t.commission ?? 0
  const total = t.action === 'BUY' ? -(gross + commission) : gross - commission

  rows.push({
    id: `bt-${t.id}`,
    source: t.source,
    date,
    description: `${t.action} ${t.symbol} — ${t.quantity} shares @ ${fmtCurrency(t.price, t.currency)}`,
    amount: total,
    currency: t.currency,
    type: t.action,
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

/** Map a BrokerageCorpAction to one or more UnifiedTransactionRows */
export function mapCorpAction(a: BrokerageCorpAction): UnifiedTransactionRow[] {
  const rows: UnifiedTransactionRow[] = []
  const date = a.appliedAt || a.payDate || a.exDate || '1970-01-01T00:00:00Z'

  if (a.type === 'DIVIDEND' && a.amount !== undefined) {
    rows.push({
      id: `ca-${a.id}`,
      source: a.source,
      date,
      description: `${a.symbol} Dividend — ${fmtCurrency(a.amount, a.currency ?? 'USD')}`,
      amount: a.amount,
      currency: a.currency ?? 'USD',
      type: 'DIVIDEND',
      symbol: a.symbol,
      isBank: false,
      originalBrokerage: a,
    })
  } else {
    rows.push({
      id: `ca-${a.id}`,
      source: a.source,
      date,
      description: `${a.symbol} ${a.type}${a.amount ? ` — ${fmtCurrency(a.amount, a.currency ?? 'USD')}` : ''}`,
      amount: a.amount ?? 0,
      currency: a.currency ?? 'USD',
      type: a.type === 'OTHER' ? 'CORP ACTION' : a.type,
      symbol: a.symbol,
      isBank: false,
      originalBrokerage: a,
    })
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
    const txns = await db.brokerageTransactions.toArray()
    for (const t of txns) {
      for (const row of mapBrokerageTransaction(t)) {
        if (filterBrokerageRow(row, filters)) {
          brokerageRows.push(row)
        }
      }
    }

    const actions = await db.brokerageCorpActions.toArray()
    for (const a of actions) {
      for (const row of mapCorpAction(a)) {
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
 * `db.brokerageCorpActions` (brokerage), merges them into a common row shape,
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
