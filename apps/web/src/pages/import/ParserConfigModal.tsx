import { useState, useMemo } from 'react'
import Papa from 'papaparse'
import { X } from 'lucide-react'
import { CustomCsvParser, computeHeaderFingerprint } from '@lokfi/parser-core'
import type { Statement, CustomParserProfile, StatementSource } from '@lokfi/parser-core'
import { db } from '../../lib/db/db'

interface Props {
  file: File
  rawText: string
  existingProfile?: CustomParserProfile
  onClose: () => void
  onApply: (statement: Statement, profile: CustomParserProfile) => void
}

const STATEMENT_SOURCES: StatementSource[] = [
  'generic', 'ocbc', 'dbs', 'uob', 'citibank', 'cdc', 'maybank',
]

type AmountMode = 'single' | 'split'

export function ParserConfigModal({ file, rawText, existingProfile, onClose, onApply }: Props) {
  const [skipRows, setSkipRows] = useState<number>(existingProfile?.skipRows ?? 0)
  const [source, setSource] = useState<StatementSource>(existingProfile?.source ?? 'generic')
  const [statementType, setStatementType] = useState<'debit' | 'credit'>(
    existingProfile?.statementType ?? 'debit',
  )
  const [accountNo, setAccountNo] = useState<string>(existingProfile?.accountNo ?? '')
  const [negateAmount, setNegateAmount] = useState<boolean>(existingProfile?.negateAmount ?? false)

  const [dateCol, setDateCol] = useState<number>(
    typeof existingProfile?.columnMap.date === 'number' ? existingProfile.columnMap.date : 0,
  )
  const [descCol, setDescCol] = useState<number>(
    typeof existingProfile?.columnMap.description === 'number'
      ? existingProfile.columnMap.description
      : 1,
  )
  const [amountMode, setAmountMode] = useState<AmountMode>(
    existingProfile?.columnMap.debit !== undefined || existingProfile?.columnMap.credit !== undefined
      ? 'split'
      : 'single',
  )
  const [amountCol, setAmountCol] = useState<number>(
    typeof existingProfile?.columnMap.amount === 'number' ? existingProfile.columnMap.amount : 2,
  )
  const [debitCol, setDebitCol] = useState<number>(
    typeof existingProfile?.columnMap.debit === 'number' ? existingProfile.columnMap.debit : 2,
  )
  const [creditCol, setCreditCol] = useState<number>(
    typeof existingProfile?.columnMap.credit === 'number' ? existingProfile.columnMap.credit : 3,
  )
  const [balanceCol, setBalanceCol] = useState<number>(
    typeof existingProfile?.columnMap.balance === 'number' ? existingProfile.columnMap.balance : -1,
  )

  const [parseError, setParseError] = useState<string | null>(null)
  const [showNameInput, setShowNameInput] = useState<boolean>(false)
  const [profileName, setProfileName] = useState<string>(existingProfile?.name ?? '')

  // Parse raw CSV once
  const parsedRows = useMemo<string[][]>(() => {
    const { data } = Papa.parse<string[]>(rawText, { skipEmptyLines: false })
    return (data as string[][]).filter(r => r.some(c => c.trim()))
  }, [rawText])

  // Header row is at index `skipRows`
  const headerRow = useMemo<string[]>(() => {
    return parsedRows[skipRows] ?? []
  }, [parsedRows, skipRows])

  // Data rows are after the header row (up to 5)
  const previewDataRows = useMemo<string[][]>(() => {
    return parsedRows.slice(skipRows + 1, skipRows + 6)
  }, [parsedRows, skipRows])

  // Column labels like "[0] date", "[1] description"
  const columnLabels = useMemo<string[]>(() => {
    return headerRow.map((h, i) => `[${i}] ${h}`)
  }, [headerRow])

  function buildProfile(name: string): CustomParserProfile {
    const now = new Date().toISOString()
    const fingerprint = computeHeaderFingerprint([headerRow])
    const columnMap: CustomParserProfile['columnMap'] = {
      date: dateCol,
      description: descCol,
      ...(balanceCol !== -1 ? { balance: balanceCol } : {}),
      ...(amountMode === 'single'
        ? { amount: amountCol }
        : { debit: debitCol, credit: creditCol }),
    }
    return {
      id: existingProfile?.id ?? crypto.randomUUID(),
      name,
      headerFingerprint: fingerprint,
      createdAt: existingProfile?.createdAt ?? now,
      updatedAt: now,
      columnMap,
      skipRows,
      statementType,
      accountNo: accountNo.trim() || undefined,
      negateAmount,
      source,
    }
  }

  function parseWithProfile(profile: CustomParserProfile): Statement {
    const parser = new CustomCsvParser(profile)
    return parser.parse(rawText)
  }

  function handleApplyWithoutSaving() {
    setParseError(null)
    const profile = buildProfile(profileName || `${file.name} profile`)
    try {
      const statement = parseWithProfile(profile)
      onApply(statement, profile)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Unknown parse error')
    }
  }

  async function handleSaveAndApply() {
    setParseError(null)
    if (!profileName.trim()) {
      setShowNameInput(true)
      return
    }
    const profile = buildProfile(profileName.trim())
    try {
      const statement = parseWithProfile(profile)
      await db.customParsers.put(profile)
      onApply(statement, profile)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Unknown parse error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative flex flex-col w-full max-w-2xl max-h-[90vh] rounded-xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ backgroundColor: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)' }}
        >
          <div>
            <h2 className="font-semibold text-base" style={{ color: 'var(--fg)' }}>
              Configure CSV Parser
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--fg)', opacity: 0.6 }}>
              {file.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 transition-colors"
            style={{ color: 'var(--fg)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-5 flex flex-col gap-6">

          {/* Section 1: Options */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--accent-text)' }}>
              Options
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {/* Skip rows */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--fg)' }}>
                  Skip rows (before header)
                </label>
                <input
                  type="number"
                  min={0}
                  value={skipRows}
                  onChange={(e) => setSkipRows(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1"
                  style={{
                    backgroundColor: 'var(--bg-sidebar)',
                    border: '1px solid var(--border)',
                    color: 'var(--fg)',
                  }}
                />
              </div>

              {/* Bank / Source */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--fg)' }}>
                  Bank / Source
                </label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value as StatementSource)}
                  className="rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1"
                  style={{
                    backgroundColor: 'var(--bg-sidebar)',
                    border: '1px solid var(--border)',
                    color: 'var(--fg)',
                  }}
                >
                  {STATEMENT_SOURCES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Statement type */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--fg)' }}>
                  Statement type
                </label>
                <select
                  value={statementType}
                  onChange={(e) => setStatementType(e.target.value as 'debit' | 'credit')}
                  className="rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1"
                  style={{
                    backgroundColor: 'var(--bg-sidebar)',
                    border: '1px solid var(--border)',
                    color: 'var(--fg)',
                  }}
                >
                  <option value="debit">Debit</option>
                  <option value="credit">Credit</option>
                </select>
              </div>

              {/* Account number */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--fg)' }}>
                  Account number (optional override)
                </label>
                <input
                  type="text"
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value)}
                  placeholder="e.g. 123-456-789"
                  className="rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1"
                  style={{
                    backgroundColor: 'var(--bg-sidebar)',
                    border: '1px solid var(--border)',
                    color: 'var(--fg)',
                  }}
                />
              </div>

              {/* Negate amounts */}
              <div className="flex items-center gap-2 col-span-2">
                <input
                  id="negate-check"
                  type="checkbox"
                  checked={negateAmount}
                  onChange={(e) => setNegateAmount(e.target.checked)}
                  className="rounded"
                  style={{ accentColor: 'var(--accent)' }}
                />
                <label htmlFor="negate-check" className="text-sm" style={{ color: 'var(--fg)' }}>
                  Negate all amounts (flip sign)
                </label>
              </div>
            </div>
          </section>

          {/* Section 2: CSV Preview */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--accent-text)' }}>
              CSV Preview
            </h3>
            <div
              className="rounded-lg overflow-hidden text-xs"
              style={{ border: '1px solid var(--border)' }}
            >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-sidebar)' }}>
                      {headerRow.length > 0
                        ? headerRow.map((col, i) => (
                          <th
                            key={i}
                            className="px-3 py-2 text-left font-medium whitespace-nowrap"
                            style={{ color: 'var(--fg)', borderBottom: '1px solid var(--border)' }}
                          >
                            [{i}] {col}
                          </th>
                        ))
                        : (
                          <th
                            className="px-3 py-2 text-left"
                            style={{ color: 'var(--fg)', borderBottom: '1px solid var(--border)' }}
                          >
                            No header detected
                          </th>
                        )}
                    </tr>
                  </thead>
                  <tbody>
                    {skipRows > 0 && (
                      <tr>
                        <td
                          colSpan={Math.max(headerRow.length, 1)}
                          className="px-3 py-1.5 text-center text-xs italic"
                          style={{
                            color: 'var(--fg)',
                            opacity: 0.5,
                            borderBottom: '1px solid var(--border)',
                            backgroundColor: 'var(--accent-subtle)',
                          }}
                        >
                          --- {skipRows} row{skipRows !== 1 ? 's' : ''} skipped ---
                        </td>
                      </tr>
                    )}
                    {previewDataRows.map((row, ri) => (
                      <tr
                        key={ri}
                        style={{
                          borderBottom: ri < previewDataRows.length - 1
                            ? '1px solid var(--border)'
                            : undefined,
                        }}
                      >
                        {headerRow.map((_, ci) => (
                          <td
                            key={ci}
                            className="px-3 py-2 whitespace-nowrap"
                            style={{ color: 'var(--fg)', opacity: 0.8 }}
                          >
                            {row[ci] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {previewDataRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={Math.max(headerRow.length, 1)}
                          className="px-3 py-3 text-center text-xs italic"
                          style={{ color: 'var(--fg)', opacity: 0.5 }}
                        >
                          No data rows found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Section 3: Column Mapping */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--accent-text)' }}>
              Column Mapping
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {/* Date column */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--fg)' }}>
                  Date column
                </label>
                <select
                  value={dateCol}
                  onChange={(e) => setDateCol(parseInt(e.target.value, 10))}
                  className="rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1"
                  style={{
                    backgroundColor: 'var(--bg-sidebar)',
                    border: '1px solid var(--border)',
                    color: 'var(--fg)',
                  }}
                >
                  {columnLabels.map((label, i) => (
                    <option key={i} value={i}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Description column */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--fg)' }}>
                  Description column
                </label>
                <select
                  value={descCol}
                  onChange={(e) => setDescCol(parseInt(e.target.value, 10))}
                  className="rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1"
                  style={{
                    backgroundColor: 'var(--bg-sidebar)',
                    border: '1px solid var(--border)',
                    color: 'var(--fg)',
                  }}
                >
                  {columnLabels.map((label, i) => (
                    <option key={i} value={i}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Amount mode */}
              <div className="col-span-2 flex flex-col gap-2">
                <span className="text-xs font-medium" style={{ color: 'var(--fg)' }}>
                  Amount mode
                </span>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer"
                    style={{ color: 'var(--fg)' }}>
                    <input
                      type="radio"
                      name="amount-mode"
                      value="single"
                      checked={amountMode === 'single'}
                      onChange={() => setAmountMode('single')}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    Single amount column
                  </label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer"
                    style={{ color: 'var(--fg)' }}>
                    <input
                      type="radio"
                      name="amount-mode"
                      value="split"
                      checked={amountMode === 'split'}
                      onChange={() => setAmountMode('split')}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    Split debit / credit columns
                  </label>
                </div>
              </div>

              {/* Amount column (single mode) */}
              {amountMode === 'single' && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: 'var(--fg)' }}>
                    Amount column
                  </label>
                  <select
                    value={amountCol}
                    onChange={(e) => setAmountCol(parseInt(e.target.value, 10))}
                    className="rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1"
                    style={{
                      backgroundColor: 'var(--bg-sidebar)',
                      border: '1px solid var(--border)',
                      color: 'var(--fg)',
                    }}
                  >
                    {columnLabels.map((label, i) => (
                      <option key={i} value={i}>{label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Split mode: debit + credit */}
              {amountMode === 'split' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: 'var(--fg)' }}>
                      Debit column (outflow)
                    </label>
                    <select
                      value={debitCol}
                      onChange={(e) => setDebitCol(parseInt(e.target.value, 10))}
                      className="rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1"
                      style={{
                        backgroundColor: 'var(--bg-sidebar)',
                        border: '1px solid var(--border)',
                        color: 'var(--fg)',
                      }}
                    >
                      {columnLabels.map((label, i) => (
                        <option key={i} value={i}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: 'var(--fg)' }}>
                      Credit column (inflow)
                    </label>
                    <select
                      value={creditCol}
                      onChange={(e) => setCreditCol(parseInt(e.target.value, 10))}
                      className="rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1"
                      style={{
                        backgroundColor: 'var(--bg-sidebar)',
                        border: '1px solid var(--border)',
                        color: 'var(--fg)',
                      }}
                    >
                      {columnLabels.map((label, i) => (
                        <option key={i} value={i}>{label}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Balance column */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--fg)' }}>
                  Balance column
                </label>
                <select
                  value={balanceCol}
                  onChange={(e) => setBalanceCol(parseInt(e.target.value, 10))}
                  className="rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1"
                  style={{
                    backgroundColor: 'var(--bg-sidebar)',
                    border: '1px solid var(--border)',
                    color: 'var(--fg)',
                  }}
                >
                  <option value={-1}>— none —</option>
                  {columnLabels.map((label, i) => (
                    <option key={i} value={i}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Parse error */}
          {parseError && (
            <div
              className="rounded-md px-4 py-3 text-sm"
              style={{
                backgroundColor: '#fee2e2',
                border: '1px solid #fca5a5',
                color: '#b91c1c',
              }}
            >
              {parseError}
            </div>
          )}

          {/* Profile name input (revealed when saving) */}
          {showNameInput && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--fg)' }}>
                Profile name
              </label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="e.g. DBS Savings 2024"
                autoFocus
                className="rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1"
                style={{
                  backgroundColor: 'var(--bg-sidebar)',
                  border: '1px solid var(--border)',
                  color: 'var(--fg)',
                }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="shrink-0 flex items-center justify-between gap-3 px-5 py-4"
          style={{ borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
        >
          <button
            onClick={handleApplyWithoutSaving}
            className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
            style={{
              border: '1px solid var(--border)',
              color: 'var(--fg)',
              backgroundColor: 'var(--bg)',
            }}
          >
            Apply without saving
          </button>
          <button
            onClick={handleSaveAndApply}
            className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-text)',
              border: '1px solid transparent',
            }}
          >
            Save as Profile &amp; Apply
          </button>
        </div>
      </div>
    </div>
  )
}
