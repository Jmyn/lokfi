import { useState } from 'react'
import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, X, ChevronDown } from 'lucide-react'
import type { Statement, Transaction } from '@lokfi/parser-core'

export type FileParseStatus = 'pending' | 'parsing' | 'success' | 'error'

export interface FileParseResult {
  file: File
  status: FileParseStatus
  transactionCount?: number
  statement?: Statement
  error?: string
  rawText?: string
  profileName?: string
}

interface FileStatusListProps {
  items: FileParseResult[]
  onConfigure: (item: FileParseResult) => void
  onRemove: (item: FileParseResult) => void
}

// When adding a new parser, add its source key here so users see a human-readable label.
// Unlisted sources fall back to the raw source key string (see sourceLabel() below).
const SOURCE_LABELS: Record<string, string> = {
  'ocbc-credit': 'OCBC Credit',
  'generic-pdf': 'Generic PDF',
  'generic': 'Generic CSV',
  'cdc': 'CDC Debit',
}
function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source
}

/** Groups statement transactions by their per-transaction accountNo, preserving insertion order. */
function groupByAccount(statement: Statement) {
  const groups = new Map<string, typeof statement.transactions>()
  for (const txn of statement.transactions) {
    const key = txn.accountNo ?? statement.accountNo
    const existing = groups.get(key)
    if (existing) existing.push(txn)
    else groups.set(key, [txn])
  }
  return [...groups.entries()].map(([accountNo, transactions]) => ({ accountNo, transactions }))
}

/** Masks a 16-digit card number to show only the last 4 digits. */
function maskCardNo(accountNo: string): string {
  if (accountNo === 'UNKNOWN-ACCOUNT') return 'Unknown'
  if (accountNo.length >= 4) return '····' + accountNo.slice(-4)
  return accountNo
}

/** Returns the display label for an account number (handles UNKNOWN-ACCOUNT case). */
function accountNoLabel(accountNo: string): React.ReactNode {
  if (accountNo === 'UNKNOWN-ACCOUNT') {
    return (
      <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
        <AlertTriangle className="h-3 w-3" />
        <span>????</span>
      </span>
    )
  }
  return maskCardNo(accountNo)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatAmount(value: number) {
  const abs = Math.abs(value).toFixed(2)
  return value < 0 ? `-${abs}` : `+${abs}`
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Renders a single transaction row */
function TransactionRow({ txn }: { txn: Transaction }) {
  return (
    <>
      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
        {formatDate(txn.date)}
      </span>
      <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1 mx-1">
        {txn.description}
      </span>
      <span className={`text-xs font-mono shrink-0 ${txn.transactionValue < 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
        {formatAmount(txn.transactionValue)}
      </span>
    </>
  )
}

/** Collapsed preview: shows first 3 transactions + expand toggle */
function CollapsedAccountGroup({
  group,
  accountKey,
  isExpanded,
  onToggle,
}: {
  group: { accountNo: string; transactions: Transaction[] }
  accountKey: string
  isExpanded: boolean
  onToggle: () => void
}) {
  const PREVIEW_COUNT = 3
  const previewTxns = group.transactions.slice(0, PREVIEW_COUNT)
  const hiddenCount = group.transactions.length - PREVIEW_COUNT

  return (
    <div className="flex flex-col">
      {/* Toggle row */}
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 px-4 py-1.5 border-t border-gray-100 dark:border-gray-700/60 hover:bg-gray-100 dark:hover:bg-gray-700/40 transition-colors w-full text-left"
        aria-expanded={isExpanded}
        aria-label={`Expand ${maskCardNo(group.accountNo)} transactions`}
      >
        {/* Card number (masked) */}
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400 shrink-0 w-14">
          {accountNoLabel(group.accountNo)}
        </span>

        {/* Transaction count + expand indicator */}
        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 w-12 text-right">
          {group.transactions.length} txns
        </span>

        <span className="text-xs text-gray-300 dark:text-gray-600 shrink-0">·</span>

        {/* Preview: first 3 transactions */}
        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 flex items-center gap-1">
          {isExpanded ? (
            <>all {group.transactions.length} transactions</>
          ) : hiddenCount > 0 ? (
            <>
              showing {PREVIEW_COUNT} of {group.transactions.length}
            </>
          ) : (
            <>{group.transactions.length} transaction{group.transactions.length !== 1 ? 's' : ''}</>
          )}
        </span>

        <ChevronDown
          className={`h-3.5 w-3.5 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Preview rows (when collapsed) */}
      {!isExpanded && previewTxns.map((txn, i) => (
        <div
          key={`${accountKey}-${txn.date}-${i}`}
          className="flex items-center gap-2 px-4 py-1 pl-8 bg-gray-50 dark:bg-gray-800/40"
        >
          <TransactionRow txn={txn} />
        </div>
      ))}
    </div>
  )
}

/** Expanded account group: all transactions in a scrollable list */
function ExpandedAccountGroup({
  group,
  accountKey,
  isExpanded,
  onCollapse,
}: {
  group: { accountNo: string; transactions: Transaction[] }
  accountKey: string
  isExpanded: boolean
  onCollapse: () => void
}) {
  return (
    <div className="flex flex-col border-t border-gray-100 dark:border-gray-700/60">
      {/* Header row with account info + collapse button */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-50 dark:bg-gray-800/40">
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400 shrink-0 w-14">
          {accountNoLabel(group.accountNo)}
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 w-12 text-right">
          {group.transactions.length} txns
        </span>
        <span className="text-xs text-gray-300 dark:text-gray-600 shrink-0">·</span>
        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
          all {group.transactions.length} transactions
        </span>
        <button
          type="button"
          onClick={onCollapse}
          className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-expanded={isExpanded}
          aria-label={`Collapse ${maskCardNo(group.accountNo)}`}
        >
          <ChevronDown className="h-3.5 w-3.5 rotate-180 transition-transform duration-200" />
          collapse
        </button>
      </div>

      {/* Scrollable transaction list */}
      <div className="max-h-64 overflow-y-auto">
        {group.transactions.map((txn, i) => (
          <div
            key={`${accountKey}-${txn.date}-${i}`}
            className="flex items-center gap-2 px-4 py-1.5 pl-8 border-t border-gray-100 dark:border-gray-700/60 last:border-b-0"
          >
            <TransactionRow txn={txn} />
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: FileParseStatus }) {
  if (status === 'pending') {
    return (
      <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
        <Clock className="h-3.5 w-3.5" />
        Pending
      </span>
    )
  }
  if (status === 'parsing') {
    return (
      <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Parsing…
      </span>
    )
  }
  if (status === 'success') {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Done
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
      <XCircle className="h-3.5 w-3.5" />
      Error
    </span>
  )
}

export function FileStatusList({ items, onConfigure, onRemove }: FileStatusListProps) {
  if (items.length === 0) return null

  // Expand state per account (keyed by file name + file size + accountNo)
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set())

  const toggleAccount = (accountKey: string) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev)
      if (next.has(accountKey)) next.delete(accountKey)
      else next.add(accountKey)
      return next
    })
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const sample = item.statement?.transactions[0]
        const isPdf = item.file.name.toLowerCase().endsWith('.pdf') || item.file.type === 'application/pdf'

        return (
          <li
            key={item.file.name + item.file.size}
            className="flex flex-col rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm overflow-hidden"
          >
            {/* Main row: filename + status + remove */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="font-medium text-gray-800 dark:text-gray-100 truncate">
                  {item.file.name}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatBytes(item.file.size)}
                </span>
              </div>
              <div className="ml-4 flex items-start gap-2 shrink-0">
              <div className="flex flex-col items-end gap-0.5">
                <StatusBadge status={item.status} />
                {item.status === 'success' && item.transactionCount !== undefined && (
                  <span className="text-xs text-green-600 dark:text-green-400">
                    {item.transactionCount} transactions found
                  </span>
                )}
                {item.status === 'success' && item.profileName && (
                  <span className="text-xs text-blue-600 dark:text-blue-400">
                    Profile: {item.profileName}
                  </span>
                )}
                {item.status === 'success' && item.statement?.source === 'generic' && !item.profileName && (
                  <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-500 max-w-[200px] text-right">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Generic fallback — verify data
                  </span>
                )}
                {item.status === 'success' && item.rawText && !isPdf && (
                  item.statement?.source === 'generic' && !item.profileName ? (
                    <button
                      onClick={() => onConfigure(item)}
                      className="text-xs font-medium px-2 py-1 rounded border border-yellow-400 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                    >
                      Configure mapping
                    </button>
                  ) : (
                    <button
                      onClick={() => onConfigure(item)}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
                    >
                      Wrong mapping? Configure
                    </button>
                  )
                )}
                {item.status === 'error' && item.error && (
                  <span className="text-xs text-red-500 dark:text-red-400 max-w-[200px] text-right">
                    {item.error}
                  </span>
                )}
                {item.status === 'error' && item.rawText && (
                  <button
                    onClick={() => onConfigure(item)}
                    className="text-xs font-medium px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Configure parser
                  </button>
                )}
              </div>
              <button
                onClick={() => onRemove(item)}
                className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors mt-0.5"
                aria-label="Remove file"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              </div>
            </div>

            {/* Accounts breakdown: per-account rows with expandable transactions */}
            {item.status === 'success' && sample && item.statement && (() => {
              const groups = groupByAccount(item.statement)
              const isMultiAccount = groups.length > 1
              return (
                <div className="flex flex-col border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                  {/* Source + summary row */}
                  <div className="flex items-center gap-2 px-4 pt-2 pb-1.5">
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">Source</span>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                      {sourceLabel(item.statement.source)}
                    </span>
                    {isMultiAccount && (
                      <>
                        <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {groups.length} accounts
                        </span>
                      </>
                    )}
                  </div>
                  {/* Per-account rows */}
                  {groups.map((group) => {
                    const accountKey = `${item.file.name}-${item.file.size}-${group.accountNo}`
                    const isExpanded = expandedAccounts.has(accountKey)
                    return isExpanded ? (
                      <ExpandedAccountGroup
                        key={accountKey}
                        group={group}
                        accountKey={accountKey}
                        isExpanded={isExpanded}
                        onCollapse={() => toggleAccount(accountKey)}
                      />
                    ) : (
                      <CollapsedAccountGroup
                        key={accountKey}
                        group={group}
                        accountKey={accountKey}
                        isExpanded={isExpanded}
                        onToggle={() => toggleAccount(accountKey)}
                      />
                    )
                  })}
                </div>
              )
            })()}
          </li>
        )
      })}
    </ul>
  )
}
