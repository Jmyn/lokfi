import type { Statement, StatementParser, Transaction } from '@lokfi/parser-core'
import type { ParserEntry } from '@lokfi/parser-core'
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Loader2, X, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export type FileParseStatus = 'pending' | 'parsing' | 'success' | 'error'

export interface FileParseResult {
  file: File
  status: FileParseStatus
  transactionCount?: number
  statement?: Statement
  error?: string
  rawText?: string
  profileName?: string
  /** Label of the parser used (e.g. "ocbc-nxt-main", "OCBC Credit"). Derived from StatementParser.label. */
  parserLabel?: string
  /** Raw ArrayBuffer for PDF files — needed for re-parsing with a different parser. */
  rawBuffer?: ArrayBuffer
}

interface FileStatusListProps {
  items: FileParseResult[]
  availableParsers: ParserEntry[]
  onConfigure: (item: FileParseResult) => void
  onRemove: (item: FileParseResult) => void
  onChangeParser: (item: FileParseResult, parser: StatementParser) => void
}

// When adding a new parser, add its source key here so users see a human-readable label.
// Unlisted sources fall back to the raw source key string (see sourceLabel() below).
const SOURCE_LABELS: Record<string, string> = {
  'ocbc-credit': 'OCBC Credit',
  'generic-pdf': 'Generic PDF',
  generic: 'Generic CSV',
  cdc: 'CDC Debit',
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
      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{formatDate(txn.date)}</span>
      <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1 mx-1">{txn.description}</span>
      <span
        className={`text-xs font-mono shrink-0 ${txn.transactionValue < 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}
      >
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
            <>
              {group.transactions.length} transaction{group.transactions.length !== 1 ? 's' : ''}
            </>
          )}
        </span>

        <ChevronDown
          className={`h-3.5 w-3.5 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Preview rows (when collapsed) */}
      {!isExpanded &&
        previewTxns.map((txn, i) => (
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

/** Labels of built-in (non-custom) parsers — used to group in the parser selector. */
const BUILTIN_PARSER_LABELS = new Set(['CDC Debit', 'Generic CSV', 'Generic PDF', 'OCBC Credit'])

// ─── Parser Badge with Dropdown Selector ─────────────────────────────────────

function ParserBadge({
  label,
  availableParsers,
  onSelect,
  disabled,
}: {
  label: string
  availableParsers: ParserEntry[]
  onSelect: (parser: StatementParser) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const customParsers = availableParsers.filter((p) => !BUILTIN_PARSER_LABELS.has(p.label))
  const builtinParsers = availableParsers.filter((p) => BUILTIN_PARSER_LABELS.has(p.label))

  function handleSelect(parser: StatementParser) {
    setOpen(false)
    onSelect(parser)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="flex items-center gap-1 text-xs font-medium rounded-md px-2 py-1
          border border-gray-300 dark:border-gray-500
          bg-white dark:bg-gray-700
          text-gray-700 dark:text-gray-200
          hover:bg-gray-100 dark:hover:bg-gray-600
          transition-colors whitespace-nowrap"
      >
        {label}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-20 w-56 rounded-lg shadow-lg
            border border-gray-200 dark:border-gray-600
            bg-white dark:bg-gray-800
            overflow-hidden"
        >
          <div className="max-h-64 overflow-y-auto py-1">
            {customParsers.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Custom Profiles
                </div>
                {customParsers.map((entry) => (
                  <button
                    key={entry.label}
                    type="button"
                    onClick={() => handleSelect(entry.parser)}
                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors
                      ${
                        entry.label === label
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                      }`}
                  >
                    {entry.label}
                  </button>
                ))}
                <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
              </>
            )}
            <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Built-in
            </div>
            {builtinParsers.map((entry) => (
              <button
                key={entry.label}
                type="button"
                onClick={() => handleSelect(entry.parser)}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors
                  ${
                    entry.label === label
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                  }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function FileStatusList({
  items,
  availableParsers,
  onConfigure,
  onRemove,
  onChangeParser,
}: FileStatusListProps) {
  if (items.length === 0) return null

  // Expand state per account (keyed by file name + file size + accountNo)
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set())
  const prevLabelsRef = useRef('')

  // Clear expanded accounts when a file's parser changes (new parser may produce different account numbers)
  useEffect(() => {
    const labels = items.map((i) => `${i.file.name}:${i.file.size}:${i.parserLabel}`).join('|')
    if (prevLabelsRef.current && prevLabelsRef.current !== labels) {
      setExpandedAccounts(new Set())
    }
    prevLabelsRef.current = labels
  }, [items])

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
                <span className="font-medium text-gray-800 dark:text-gray-100 truncate">{item.file.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{formatBytes(item.file.size)}</span>
              </div>
              <div className="ml-4 flex items-start gap-2 shrink-0">
                <div className="flex flex-col items-end gap-0.5">
                  {/* Parser badge + status row */}
                  <div className="flex items-center gap-1.5">
                    {(item.status === 'success' || item.status === 'error') && item.parserLabel && (
                      <ParserBadge
                        label={item.parserLabel}
                        availableParsers={availableParsers}
                        onSelect={(parser) => onChangeParser(item, parser)}
                      />
                    )}
                    {item.status === 'parsing' && item.parserLabel && (
                      <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400 whitespace-nowrap">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {item.parserLabel}
                      </span>
                    )}
                    <StatusBadge status={item.status} />
                  </div>
                  {item.status === 'success' && item.transactionCount !== undefined && (
                    <span className="text-xs text-green-600 dark:text-green-400">
                      {item.transactionCount} transactions found
                    </span>
                  )}
                  {item.status === 'success' &&
                    item.rawText &&
                    !isPdf &&
                    (item.statement?.source === 'generic' && !item.profileName ? (
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
                    ))}
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
            {item.status === 'success' &&
              sample &&
              item.statement &&
              (() => {
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
                          <span className="text-xs text-gray-500 dark:text-gray-400">{groups.length} accounts</span>
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
