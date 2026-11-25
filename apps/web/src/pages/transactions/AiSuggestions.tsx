import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, CircleHelp, Sparkles, X } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { aiCredentials } from '../../lib/ai/credentials'
import { aiProvider } from '../../lib/ai/provider'
import {
  type AiSuggestion,
  type AppliedAiCategory,
  acceptAiCategories,
  prepareAiRun,
  undoAiCategories,
} from '../../lib/ai/transactionSuggestions'
import type { DbTransaction } from '../../lib/db/db'
import type { DbCategory } from '../../lib/db/seedCategories'
import { CategoryCombobox } from './CategoryCombobox'
import type { TransactionRowExit } from './TransactionTable'
import type { Filters } from './filterTypes'

const ACCEPT_TRANSITION_MS = 150

const aiButton =
  'inline-flex items-center gap-2 rounded-md bg-amber-700 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600'

const secondaryButton =
  'shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 disabled:opacity-40'

interface AiDraft extends AiSuggestion {
  categoryId: string
}

interface Run {
  filters: Filters
  status: 'running' | 'finished' | 'failed'
  total: number
  checked: number
  matches: number
  accepted: number
  suggestions: AiDraft[]
  settling: AiDraft[]
  rowExits: Map<string, TransactionRowExit>
  error?: string
}

interface Job {
  filters: Filters
  controller: AbortController
  snapshot?: Awaited<ReturnType<typeof prepareAiRun>>
}

interface BulkApply {
  job: Job
  drafts: AiDraft[]
  changes: AppliedAiCategory[]
}

export function AiSuggestions({
  filters,
  categories,
  children,
}: {
  filters: Filters
  categories: DbCategory[]
  children: (
    renderSuggestion: (transaction: DbTransaction) => ReactNode,
    categoryHeaderAction: ReactNode,
    rowExits: ReadonlyMap<string, TransactionRowExit> | undefined,
    onRowExit: (id: string) => void
  ) => ReactNode
}) {
  const hasKey = useLiveQuery(() => aiCredentials.hasCredentials(aiProvider.id), [])
  const [enabled, setEnabled] = useState(false)
  const [run, setRun] = useState<Run | null>(null)
  const [saving, setSaving] = useState<'all' | 'undo' | null>(null)
  const [individualSaves, setIndividualSaves] = useState(0)
  const [lastBulkApply, setLastBulkApply] = useState<BulkApply | null>(null)
  const disclosureId = useId()
  const acceptAllTipId = useId()
  const jobRef = useRef<Job | null>(null)
  const visibleRun = run?.filters === filters ? run : null
  const suggestions = visibleRun?.suggestions
  const settling = visibleRun?.settling
  const suggestionsById = useMemo(
    () => new Map(suggestions?.map((suggestion) => [suggestion.transaction.id, suggestion])),
    [suggestions]
  )
  const categoryIds = useMemo(() => new Set(categories.map(({ id }) => id)), [categories])
  const applicableDrafts =
    suggestions?.filter(
      ({ categoryId, transaction }) =>
        categoryIds.has(categoryId) && categoryId !== (transaction.manualCategory ?? transaction.category)
    ) ?? []

  useEffect(() => {
    if (!settling?.length) return
    // A category filter or page change can remove a row before its animation runs.
    const timeout = window.setTimeout(() => {
      setRun(
        (current) =>
          current && {
            ...current,
            settling: current.settling.filter((draft) => !settling.includes(draft)),
          }
      )
    }, 1000)
    return () => window.clearTimeout(timeout)
  }, [settling])

  const finishTransition = useCallback((suggestion: AiDraft) => {
    setRun((current) =>
      current?.settling.includes(suggestion)
        ? {
            ...current,
            settling: current.settling.filter((item) => item !== suggestion),
          }
        : current
    )
  }, [])

  const finishRowExit = useCallback((id: string) => {
    setRun((current) => {
      if (!current?.rowExits.has(id)) return current
      const rowExits = new Map(current.rowExits)
      rowExits.delete(id)
      return { ...current, rowExits }
    })
  }, [])

  useEffect(() => {
    return () => {
      if (jobRef.current?.filters === filters) {
        jobRef.current.controller.abort()
        jobRef.current = null
      }
    }
  }, [filters])

  useEffect(() => {
    if (hasKey === false || filters.sourceType === 'brokerage') {
      jobRef.current?.controller.abort()
      jobRef.current = null
      setEnabled(false)
      setRun(null)
    }
  }, [hasKey, filters.sourceType])

  async function start(previous?: Run) {
    const previousJob = jobRef.current
    previousJob?.controller.abort()
    const snapshot = previous?.checked && previousJob?.filters === filters ? previousJob.snapshot : undefined
    const job: Job = { filters, controller: new AbortController(), snapshot }
    jobRef.current = job
    const { signal } = job.controller
    const active = () => jobRef.current === job && !signal.aborted

    setRun({
      filters,
      status: 'running',
      total: previous?.total ?? 0,
      checked: previous?.checked ?? 0,
      matches: previous?.matches ?? 0,
      accepted: previous?.accepted ?? 0,
      suggestions: previous?.suggestions ?? [],
      settling: [],
      rowExits: new Map(),
    })

    try {
      const prepared = snapshot ?? (await prepareAiRun(filters))
      if (!active()) return
      job.snapshot = prepared
      const { context, rows } = prepared
      setRun((current) => current && { ...current, total: rows.length })

      if (rows.length) {
        const key = (await aiCredentials.retrieve(aiProvider.id))?.apiKey
        if (!active()) return
        if (!key) throw new Error('Re-save your OpenAI API key in AI Providers settings.')

        const provider = aiProvider.create(key)
        let checked = previous?.checked ?? 0
        await provider.suggestCategories(
          rows.slice(checked).map((row) => row.input),
          context,
          signal,
          (results) => {
            if (!active()) return

            const batch = rows.slice(checked, checked + results.size)
            const suggestions = batch.flatMap((row) => {
              const decision = results.get(row.input.id) ?? { type: 'unavailable' as const }
              const categoryId = decision.type === 'category' ? decision.categoryId : ''
              const currentCategory = row.transaction.manualCategory ?? row.transaction.category
              return decision.type === 'category' && categoryId === currentCategory
                ? []
                : [{ ...row, decision, categoryId }]
            })
            checked += batch.length
            const completed = checked
            setRun(
              (current) =>
                current && {
                  ...current,
                  checked: completed,
                  matches: current.matches + batch.length - suggestions.length,
                  suggestions: [...current.suggestions, ...suggestions],
                }
            )
          }
        )
      }

      if (active()) {
        job.snapshot = undefined
        setRun((current) => current && { ...current, status: 'finished' })
      }
    } catch (error) {
      if (active()) {
        const message = error instanceof Error ? error.message : 'Suggestions could not be loaded.'
        setRun((current) => current && { ...current, status: 'failed', error: message })
      }
    }
  }

  function toggle() {
    if (enabled) {
      jobRef.current?.controller.abort()
      jobRef.current = null
      setRun(null)
      setEnabled(false)
    } else {
      setEnabled(true)
      void start()
    }
  }

  function edit(suggestion: AiDraft, categoryId: string) {
    setRun(
      (current) =>
        current && {
          ...current,
          suggestions: current.suggestions.map((item) => (item === suggestion ? { ...item, categoryId } : item)),
        }
    )
  }

  function skip(suggestion: AiDraft) {
    setRun(
      (current) => current && { ...current, suggestions: current.suggestions.filter((item) => item !== suggestion) }
    )
  }

  async function accept(drafts: AiDraft[], mode: 'one' | 'all') {
    const job = jobRef.current
    if (saving || !job || job.filters !== filters || !drafts.length) return
    if (mode === 'all') {
      if (individualSaves) return
      setSaving('all')
    } else {
      setIndividualSaves((count) => count + 1)
    }

    const { signal } = job.controller
    const exitingId =
      mode === 'one' &&
      filters.categoryId === '__uncategorised__' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? drafts[0].transaction.id
        : undefined
    let exitReady = false
    if (exitingId) {
      setRun(
        (current) =>
          current && {
            ...current,
            rowExits: new Map(current.rowExits).set(exitingId, 'saving'),
          }
      )
    }
    try {
      const results = await acceptAiCategories(
        drafts.map((suggestion) => ({ suggestion, categoryId: suggestion.categoryId })),
        signal
      )
      const appliedChanges = results.filter((result) => result.status === 'saved')
      if (mode === 'all' && appliedChanges.length) {
        setLastBulkApply({ job, drafts, changes: appliedChanges })
      }
      if (signal.aborted) return

      const resolved = new Set(results.filter(({ status }) => status !== 'missing-category').map(({ id }) => id))
      const applied = appliedChanges.length
      const stale = resolved.size - applied
      const missing = results.length - resolved.size
      exitReady = !!exitingId && applied > 0
      setRun(
        (current) =>
          current && {
            ...current,
            accepted: current.accepted + applied,
            suggestions: current.suggestions.filter((item) => !resolved.has(item.transaction.id)),
            settling: mode === 'one' && applied ? [...current.settling, ...drafts] : current.settling,
            rowExits: exitingId && applied ? new Map(current.rowExits).set(exitingId, 'ready') : current.rowExits,
          }
      )

      if (mode === 'all') {
        const summary = `Applied ${applied} of ${drafts.length} AI suggestions.`
        const details = [
          stale ? `Skipped ${stale} due to changes since the run.` : '',
          missing ? `Choose another category for ${missing} remaining.` : '',
        ]
          .filter(Boolean)
          .join(' ')
        if (details) toast.info(`${summary} ${details}`)
        else toast.success(summary)
      } else if (missing) {
        toast.error('This category is unavailable. Choose another category.')
      } else if (stale) {
        toast.info('This transaction changed. Its current category was kept.')
      }
    } catch {
      if (!signal.aborted) toast.error('The categories could not be saved. Try again.')
    } finally {
      if (exitingId && !exitReady && !signal.aborted) finishRowExit(exitingId)
      if (mode === 'all') setSaving(null)
      else setIndividualSaves((count) => count - 1)
    }
  }

  async function undo() {
    if (saving || individualSaves || !lastBulkApply) return
    const batch = lastBulkApply
    setSaving('undo')
    try {
      const restored = new Set(await undoAiCategories(batch.changes))
      setLastBulkApply(null)
      if (jobRef.current === batch.job) {
        setRun(
          (current) =>
            current && {
              ...current,
              accepted: current.accepted - restored.size,
              suggestions: [
                ...current.suggestions,
                ...batch.drafts.filter(({ transaction }) => restored.has(transaction.id)),
              ],
            }
        )
      }
      const summary = `Restored ${restored.size} of ${batch.changes.length} previous categories.`
      if (restored.size === batch.changes.length) toast.success(summary)
      else toast.info(`${summary} Skipped rows that changed after the bulk apply.`)
    } catch {
      toast.error('The previous categories could not be restored. Try again.')
    } finally {
      setSaving(null)
    }
  }

  function renderSuggestion(transaction: DbTransaction) {
    const applied = settling?.find(({ transaction: original }) => original.id === transaction.id)
    const suggestion = suggestionsById.get(transaction.id) ?? applied
    if (!suggestion) return null

    return (
      <SuggestionReview
        key={suggestion.transaction.id}
        suggestion={suggestion}
        currentCategory={transaction.manualCategory ?? transaction.category}
        categoryExists={categoryIds.has(suggestion.categoryId)}
        saving={saving !== null || !!applied}
        collapsing={!!applied && transaction.manualCategory !== applied.transaction.manualCategory}
        onChange={(categoryId) => edit(suggestion, categoryId)}
        onAccept={() => accept([suggestion], 'one')}
        onSkip={() => skip(suggestion)}
        onCollapsed={finishTransition}
      />
    )
  }

  return (
    <>
      {filters.sourceType !== 'brokerage' && (
        <section aria-label="AI suggestions" className="border-b px-5 py-2.5" style={{ borderColor: 'var(--border)' }}>
          <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2">
            {hasKey ? (
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-describedby={disclosureId}
                disabled={saving !== null}
                onClick={toggle}
                className={aiButton}
              >
                <Sparkles size={16} aria-hidden="true" />
                Categorise with AI
                <span
                  className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${enabled ? 'bg-white' : 'bg-amber-900'}`}
                  aria-hidden="true"
                >
                  <span
                    className={`h-3 w-3 rounded-full transition-transform ${enabled ? 'translate-x-3 bg-amber-700' : 'bg-white'}`}
                  />
                </span>
              </button>
            ) : hasKey === false ? (
              <Link to="/settings/ai" className={aiButton} aria-describedby="ai-provider-setup">
                <Sparkles size={16} aria-hidden="true" />
                Categorise with AI
              </Link>
            ) : null}
            {hasKey !== undefined && <AiCategorisationTips />}
            {hasKey === false && (
              <span id="ai-provider-setup" className="text-sm text-gray-600 dark:text-gray-400">
                OpenAI setup required
              </span>
            )}
            {hasKey && enabled && !visibleRun && (
              <button
                type="button"
                disabled={saving !== null}
                onClick={() => void start()}
                className={secondaryButton}
                style={{ borderColor: 'var(--border)' }}
              >
                Refresh suggestions
              </button>
            )}
            {visibleRun?.status === 'running' && (
              <span role="status" className="text-sm text-gray-600 dark:text-gray-400">
                {visibleRun.total
                  ? `Checked ${visibleRun.checked} of ${visibleRun.total} statement rows`
                  : 'Preparing filtered statement rows…'}
              </span>
            )}
            {visibleRun?.status === 'finished' && (
              <span role="status" className="text-sm text-gray-600 dark:text-gray-400">
                {visibleRun.total
                  ? `${visibleRun.checked} checked · ${visibleRun.suggestions.length} to review · ${visibleRun.matches} already matched · ${visibleRun.accepted} applied`
                  : 'No statement rows match these filters.'}
              </span>
            )}
            {lastBulkApply && (
              <button
                type="button"
                disabled={saving !== null || individualSaves > 0}
                onClick={() => void undo()}
                className={secondaryButton}
                style={{ borderColor: 'var(--border)' }}
              >
                {saving === 'undo' ? 'Restoring…' : 'Undo bulk apply'}
              </button>
            )}
          </div>
          {hasKey && (
            <p id={disclosureId} className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              Using AI sends descriptions from all matching statement transactions and category context to OpenAI.
              Descriptions may contain sensitive details. AI suggestions can be wrong. Review them before applying.
            </p>
          )}
          {visibleRun?.status === 'failed' && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {visibleRun.error}
              </p>
              <button
                type="button"
                disabled={saving !== null}
                onClick={() => void start(visibleRun)}
                className={secondaryButton}
                style={{ borderColor: 'var(--border)' }}
              >
                Retry remaining
              </button>
              <Link to="/settings/ai" className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
                AI Providers
              </Link>
            </div>
          )}
        </section>
      )}
      {children(
        renderSuggestion,
        applicableDrafts.length > 0 && (
          <div className="group relative">
            <button
              type="button"
              aria-describedby={acceptAllTipId}
              disabled={saving !== null || individualSaves > 0 || visibleRun?.status === 'running'}
              onClick={() => void accept(applicableDrafts, 'all')}
              className={`whitespace-nowrap rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium normal-case tracking-normal text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900 ${saving !== null || visibleRun?.status === 'running' ? 'opacity-50' : ''}`}
            >
              {saving === 'all' ? 'Accepting…' : `Accept all (${applicableDrafts.length})`}
            </button>
            <div
              id={acceptAllTipId}
              role="tooltip"
              className="invisible absolute right-0 top-full z-30 w-56 pt-1 text-left normal-case tracking-normal group-hover:visible group-focus-within:visible"
            >
              <p
                className="rounded-md border px-2.5 py-2 text-xs font-normal text-gray-700 shadow-lg dark:text-gray-200"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
              >
                Accepts suggestions across all filtered pages, including manual edits you haven’t applied yet.
              </p>
            </div>
          </div>
        ),
        visibleRun?.rowExits,
        finishRowExit
      )}
    </>
  )
}

function AiCategorisationTips() {
  return (
    <div className="group">
      <button
        type="button"
        aria-label="AI categorisation tips"
        aria-describedby="ai-categorisation-tips"
        className="grid h-9 w-9 place-items-center rounded-md text-gray-600 hover:bg-amber-100 hover:text-amber-800 focus-visible:bg-amber-100 focus-visible:text-amber-800 dark:text-gray-300 dark:hover:bg-amber-950 dark:hover:text-amber-200 dark:focus-visible:bg-amber-950 dark:focus-visible:text-amber-200"
      >
        <CircleHelp size={18} aria-hidden="true" />
      </button>
      <div
        id="ai-categorisation-tips"
        role="tooltip"
        className="invisible absolute left-0 top-full z-30 w-full max-w-sm pt-2 group-hover:visible group-focus-within:visible"
      >
        <div
          className="space-y-2 rounded-lg border p-3.5 text-sm text-gray-700 shadow-lg dark:text-gray-200"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
        >
          <p className="font-semibold text-gray-900 dark:text-white">Before you categorise with AI</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Create any custom categories you need first. In a transaction’s category picker, type the name and choose{' '}
              <strong>Create</strong>.
            </li>
            <li>Use clear category names and add rules for recurring transactions.</li>
            <li>
              AI checks every bank statement row that matches your active Transactions filters, across all pages. Start
              with the Uncategorised filter or a short date range.
            </li>
            <li>Review each suggestion before applying it, especially transfers and repayments.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function SuggestionReview({
  suggestion,
  currentCategory,
  categoryExists,
  saving,
  collapsing,
  onChange,
  onAccept,
  onSkip,
  onCollapsed,
}: {
  suggestion: AiDraft
  currentCategory?: string
  categoryExists: boolean
  saving: boolean
  collapsing: boolean
  onChange: (categoryId: string) => void
  onAccept: () => Promise<void>
  onSkip: () => void
  onCollapsed: (suggestion: AiDraft) => void
}) {
  const [applying, setApplying] = useState(false)
  const { decision, categoryId } = suggestion
  let placeholder = 'Choose a category'
  if (decision.type === 'unavailable') {
    placeholder = decision.reason === 'input-too-large' ? 'Description exceeds AI limit' : 'No AI result'
  }
  const confidence =
    decision.type === 'category' && decision.categoryId === categoryId ? decision.confidence : undefined
  const disabled = saving || applying

  useEffect(() => {
    if (!collapsing) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timeout = window.setTimeout(() => onCollapsed(suggestion), reducedMotion ? 0 : ACCEPT_TRANSITION_MS)
    return () => window.clearTimeout(timeout)
  }, [collapsing, onCollapsed, suggestion])

  async function apply() {
    if (disabled) return
    setApplying(true)
    try {
      await onAccept()
    } finally {
      setApplying(false)
    }
  }

  return (
    <div
      aria-busy={applying || undefined}
      aria-hidden={collapsing || undefined}
      className="grid transition-[grid-template-rows,opacity] ease-out motion-reduce:transition-none"
      style={{
        gridTemplateRows: collapsing ? '0fr' : '1fr',
        opacity: collapsing ? 0 : 1,
        transitionDuration: `${ACCEPT_TRANSITION_MS}ms`,
      }}
    >
      <div className={collapsing ? 'min-h-0 overflow-hidden' : 'min-h-0'}>
        <div className="mt-1 inline-flex flex-wrap items-center gap-1 rounded-md border border-amber-200 bg-amber-50 p-0.5 pl-1.5 dark:border-amber-800 dark:bg-amber-950/40">
          <Sparkles size={13} className="shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          <CategoryCombobox
            inline
            ariaLabel="AI suggested category"
            value={categoryId}
            disabled={disabled}
            onChange={onChange}
            placeholder={placeholder}
          />
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Apply AI suggestion"
              title="Apply AI suggestion"
              disabled={disabled || categoryId === currentCategory || !categoryExists}
              onClick={() => void apply()}
              className="grid h-6 w-6 place-items-center rounded text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 dark:text-emerald-300 dark:hover:bg-emerald-950"
            >
              <Check size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Skip AI suggestion"
              title="Skip AI suggestion"
              disabled={disabled}
              onClick={onSkip}
              className="grid h-6 w-6 place-items-center rounded text-gray-600 hover:bg-amber-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-amber-900"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
        {confidence !== undefined && (
          <p className="mt-1 text-xs tabular-nums text-gray-600 dark:text-gray-300">
            AI confidence {Math.round(confidence * 100)}%
          </p>
        )}
      </div>
    </div>
  )
}
