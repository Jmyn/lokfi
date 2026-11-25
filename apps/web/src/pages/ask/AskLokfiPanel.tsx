import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowUp, RotateCcw, Sparkles, X } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { type AskAnswer, askEvidenceFilters, executeAskAction, recordAskTurn } from '../../lib/ai/askLokfiActions'
import {
  type AskHistory,
  type AskQuery,
  type AskRuleDraft,
  type PendingAskClarification,
  loadAskContext,
  prepareAskRequest,
  rememberAskClarification,
} from '../../lib/ai/askLokfiData'
import { askLokfiEfforts, askLokfiModels, getAskLokfiSettings } from '../../lib/ai/askLokfiSettings'
import { aiCredentials, getAiCredentialRevision } from '../../lib/ai/credentials'
import {
  getOpenAiModelStatus,
  isOpenAiModelListFresh,
  readOpenAiModelAvailability,
} from '../../lib/ai/openAiModelAvailability'
import { aiProvider } from '../../lib/ai/provider'
import { getBackupRestoreRevision } from '../../lib/db/backup'
import { db } from '../../lib/db/db'
import { fmt, formatMonth, toYYYYMMDD } from '../../lib/format'
import { RuleEditorModal } from '../rules/RuleEditorModal'
import { type Filters, defaultFilters } from '../transactions/filterTypes'
import { useAskLokfiWorkspace } from './AskLokfiContext'

type Answer = AskAnswer | { kind: 'message'; text: string; error?: boolean }

interface Exchange {
  id: string
  question: string
  answer?: Answer
  scope?: string[]
  query?: AskQuery
}

const starters = [
  'Analyse my spending habits over the past year',
  'How is my portfolio performance over the past year?',
  'Find my overseas transactions this month',
]

const buttonClass = 'rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-amber-50 dark:hover:bg-amber-950/50'

function Breakdown({
  title,
  rows,
  onOpen,
}: {
  title: string
  rows: { key: string; label?: string; total: number; ids: Set<string> }[]
  onOpen: (ids: Set<string>) => void
}) {
  if (!rows.length) return null
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold" style={{ color: 'var(--accent-text)' }}>
        {title}
      </h3>
      <ul className="divide-y divide-stone-200 dark:divide-stone-800">
        {rows.map(({ key, label, total, ids }) => (
          <li key={key}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 py-1.5 text-left text-xs hover:underline"
              onClick={() => onOpen(ids)}
              title="View supporting transactions"
            >
              <span className="min-w-0 truncate">{label ?? key}</span>
              <span className="shrink-0 tabular">{fmt.format(total)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function AnswerCard({
  answer,
  onOpen,
  onRule,
}: {
  answer: Answer
  onOpen: (ids: Set<string>, excluded?: boolean) => void
  onRule: (draft: AskRuleDraft) => void
}) {
  switch (answer.kind) {
    case 'message':
      return <p role={answer.error ? 'alert' : undefined}>{answer.text}</p>
    case 'transactions':
      return <p>Opened Transactions with these filters.</p>
    case 'rule':
      return (
        <div className="space-y-2">
          <p>
            <strong>{answer.draft.name}</strong> assigns <strong>{answer.category}</strong>.
          </p>
          <ul className="space-y-1 text-xs text-stone-600 dark:text-stone-400">
            {answer.draft.conditions.map(({ field, operation, value }) => (
              <li key={field}>
                {field === 'source' ? 'Source' : 'Description'} {operation} “{String(value)}”
              </li>
            ))}
          </ul>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            The preview checks matching transactions across your imported history.
          </p>
          <button type="button" className={buttonClass} onClick={() => onRule(answer.draft)}>
            Review rule
          </button>
        </div>
      )
    case 'spending': {
      const { categories, exclusions, ids, matchedCount, merchants, months, recurring, total } = answer.data
      if (!matchedCount) return <p>No imported bank transactions match this scope.</p>
      const largest = categories[0]
      const peak = months.reduce<(typeof months)[number] | undefined>(
        (top, month) => (!top || month.total > top.total ? month : top),
        undefined
      )
      return (
        <div className="space-y-3">
          {largest ? (
            <p>
              <strong>{fmt.format(total)}</strong> in spending across {ids.size} {ids.size === 1 ? 'charge' : 'charges'}
              . {largest.label} was the largest category at {fmt.format(largest.total)}.
            </p>
          ) : (
            <p>No spending debits remain in this scope.</p>
          )}
          {peak && months.length > 1 && (
            <p>
              {formatMonth(peak.key)} had the highest recorded spending at {fmt.format(peak.total)}.
            </p>
          )}
          {!!ids.size && (
            <button type="button" className={buttonClass} onClick={() => onOpen(ids)}>
              View spending transactions
            </button>
          )}
          <Breakdown title="Top categories" rows={categories.slice(0, 5)} onOpen={onOpen} />
          <Breakdown title="Top merchants" rows={merchants.slice(0, 4)} onOpen={onOpen} />
          <Breakdown
            title="Spending by month"
            rows={months.map((row) => ({ ...row, label: formatMonth(row.key) }))}
            onOpen={onOpen}
          />
          <Breakdown
            title="Merchants seen in three or more months"
            rows={recurring.slice(0, 4).map((row) => ({ ...row, label: `${row.key} · ${row.months} months` }))}
            onOpen={onOpen}
          />
          {!!exclusions.length && (
            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold" style={{ color: 'var(--accent-text)' }}>
                Excluded from spending
              </h3>
              <ul className="space-y-1 text-xs">
                {exclusions.map(({ reason, label, total, count, ids }) => (
                  <li key={reason}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 py-1 text-left hover:underline"
                      onClick={() => onOpen(ids, true)}
                      title="View excluded transactions"
                    >
                      <span>
                        {label} · {count} {count === 1 ? 'debit' : 'debits'}
                      </span>
                      <span className="shrink-0 tabular">{fmt.format(total)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Imported debits in SGD. Credits and refunds are outside this total.
          </p>
        </div>
      )
    }
    case 'overseas':
      return (
        <div className="space-y-3">
          <p>
            Found <strong>{answer.data.ids.size}</strong> likely overseas transactions. {answer.data.withLocation} of{' '}
            {answer.data.reviewed} rows had a readable Citi merchant location.
          </p>
          {!!answer.data.ids.size && (
            <button type="button" className={buttonClass} onClick={() => onOpen(answer.data.ids)}>
              View overseas transactions
            </button>
          )}
          <Breakdown title="Charges by merchant location" rows={answer.data.countries} onOpen={onOpen} />
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Location is inferred from the statement and can include overseas online merchants. Rows without a location
            are unverified.
          </p>
        </div>
      )
    case 'portfolio': {
      const { change, currency, from, to, ignored } = answer.data
      if (!change || !currency || !from || !to)
        return <p>There aren’t enough comparable portfolio snapshots in this period.</p>
      const amount = (value: number) =>
        `${currency} ${value.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      return (
        <div className="space-y-2">
          <p>
            Portfolio value changed by{' '}
            <strong>
              {amount(change.abs)} ({change.pct.toFixed(2)}%)
            </strong>{' '}
            from {from.date} to {to.date}.
          </p>
          <p className="text-xs">
            Started at {amount(from.value)} · Ended at {amount(to.value)}
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Balance snapshot change, including the effect of deposits and withdrawals.
            {ignored ? ` ${ignored} incomparable snapshots excluded.` : ''}
          </p>
          <Link to="/investments" className="text-xs font-medium underline">
            Open Investments
          </Link>
        </div>
      )
    }
  }
}

export function AskLokfiPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { backupRevision, transactionFilters, setTransactionFilters, financesFilters } = useAskLokfiWorkspace()
  const hasKey = useLiveQuery(() => aiCredentials.hasCredentials(aiProvider.id), [])
  const assistantSettings = useLiveQuery(getAskLokfiSettings, [])
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [question, setQuestion] = useState('')
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [pending, setPending] = useState(false)
  const [rule, setRule] = useState<{ id: string; draft: AskRuleDraft } | null>(null)
  const [undo, setUndo] = useState<{ before: Filters; after: Filters; path: string } | null>(null)
  const history = useRef<AskHistory>({ reports: {} })
  const clarification = useRef<PendingAskClarification>(undefined)
  const active = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const headingId = useId()
  const pageFilters =
    pathname === '/transactions' ? transactionFilters : pathname === '/finances' ? financesFilters : defaultFilters
  const currentView = useRef({ pathname, pageFilters, transactionFilters })

  useLayoutEffect(() => {
    currentView.current = { pathname, pageFilters, transactionFilters }
  }, [pathname, pageFilters, transactionFilters])

  useLayoutEffect(() => () => active.current?.abort(), [])

  useEffect(() => {
    if (open && hasKey) input.current?.focus()
  }, [open, hasKey])

  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: 'nearest' })
  }, [exchanges, open])

  function openTransactions(filters: Filters) {
    const view = currentView.current
    setUndo({ before: view.transactionFilters, after: filters, path: view.pathname })
    setTransactionFilters(filters)
    if (view.pathname !== '/transactions') void navigate({ to: '/transactions' })
  }

  function undoFilters() {
    if (!undo || transactionFilters !== undo.after || pathname !== '/transactions') return
    setTransactionFilters(undo.before)
    setUndo(null)
    if (undo.path !== pathname) void navigate({ to: undo.path })
  }

  async function ask(value: string) {
    const prompt = value.trim()
    if (!prompt || active.current || !hasKey || backupRevision === undefined) return
    const exchangeId = crypto.randomUUID()
    const controller = new AbortController()
    const viewAtStart = currentView.current
    const historyAtStart = history.current
    active.current = controller
    setQuestion('')
    setPending(true)
    setExchanges((items) => [...items, { id: exchangeId, question: prompt }])
    const reply = (answer: Answer, query?: AskQuery, scope?: string[]) =>
      setExchanges((items) => items.map((item) => (item.id === exchangeId ? { ...item, answer, query, scope } : item)))
    const checkDataset = async () => {
      if ((await getBackupRestoreRevision(db)) !== backupRevision) controller.abort()
      controller.signal.throwIfAborted()
    }

    try {
      const [credentials, settings, context, availability] = await Promise.all([
        aiCredentials.retrieve(aiProvider.id),
        getAskLokfiSettings(),
        loadAskContext(),
        getAiCredentialRevision(aiProvider.id).then(readOpenAiModelAvailability),
      ])
      if (!credentials?.apiKey) throw new Error('Save an OpenAI API key in AI Providers to use Ask Lokfi.')
      const modelStatus = getOpenAiModelStatus(availability, settings.model)
      if (!modelStatus.available && (modelStatus.shutdownDate || isOpenAiModelListFresh(availability))) {
        throw new Error('Your selected model is unavailable. Refresh models or choose another in AI Providers.')
      }
      await checkDataset()
      const pendingClarification = clarification.current
      const request = prepareAskRequest(
        prompt,
        toYYYYMMDD(new Date()),
        viewAtStart.pathname,
        viewAtStart.pageFilters,
        historyAtStart,
        context,
        pendingClarification
      )
      const plan = await aiProvider.createAssistant(credentials.apiKey, settings).plan(request, controller.signal)
      await checkDataset()
      if (plan.action === 'clarify') {
        const text = plan.message || 'Try specifying a period, merchant, or category.'
        clarification.current = rememberAskClarification(plan, context, pendingClarification)
        reply({ kind: 'message', text })
        return
      }
      clarification.current = undefined

      const { answer, turn, scope, transactionView } = await executeAskAction(
        plan,
        { filters: viewAtStart.pageFilters, onTransactions: viewAtStart.pathname === '/transactions' },
        historyAtStart,
        context,
        pendingClarification
      )
      await checkDataset()
      if (transactionView) {
        if (currentView.current === viewAtStart) {
          openTransactions(transactionView)
        } else if (plan.action === 'show_transactions') {
          reply({ kind: 'message', text: 'The current view changed. Ask again to apply filters to this view.' })
          return
        }
      }
      history.current = recordAskTurn(historyAtStart, turn)
      reply(answer, turn.query, scope)
    } catch (error) {
      if (controller.signal.aborted) return
      const message =
        error instanceof Error && error.name === 'TimeoutError'
          ? 'OpenAI took too long to respond. Try again.'
          : error instanceof Error && error.name === 'Error'
            ? error.message
            : 'Ask Lokfi could not complete this request. Try rephrasing it.'
      reply({ kind: 'message', text: message, error: true })
    } finally {
      if (active.current === controller) {
        active.current = null
        setPending(false)
      }
    }
  }

  function clearConversation() {
    active.current?.abort()
    active.current = null
    history.current = { reports: {} }
    clarification.current = undefined
    setPending(false)
    setQuestion('')
    setExchanges([])
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void ask(question)
  }

  if (!open) return null

  let body: ReactNode
  if (hasKey === false) {
    body = (
      <div className="space-y-3 px-5 py-6 text-sm">
        <p>Connect your OpenAI API key to ask questions and control Lokfi.</p>
        <Link
          to="/settings/ai"
          onClick={onClose}
          className="inline-block rounded-md bg-amber-700 px-3 py-2 font-medium text-white hover:bg-amber-800"
        >
          Set up AI provider
        </Link>
      </div>
    )
  } else if (hasKey === undefined) {
    body = (
      <p className="px-5 py-6 text-sm" role="status">
        Checking AI provider settings…
      </p>
    )
  } else {
    body = (
      <>
        <div className="min-h-0 flex-1 overflow-y-auto p-4" aria-label="Ask Lokfi conversation">
          {!exchanges.length && (
            <div className="space-y-3">
              <p className="text-sm">Ask about your data, find transactions, or draft a categorisation rule.</p>
              <div className="flex flex-col items-start gap-2">
                {starters.map((starter) => (
                  <button key={starter} type="button" className={buttonClass} onClick={() => void ask(starter)}>
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          )}
          {exchanges.map(({ id, question, answer, scope, query }) => (
            <article key={id} className="mb-4 space-y-2 last:mb-0">
              <p className="ml-7 whitespace-pre-wrap break-words rounded-xl rounded-br-sm bg-amber-100 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/60 dark:text-amber-100">
                {question}
              </p>
              <div
                className="space-y-3 rounded-xl border px-3 py-2.5 text-sm"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
              >
                {scope && (
                  <ul className="flex flex-wrap gap-1" aria-label="Applied filters">
                    {(scope.length
                      ? scope
                      : [answer?.kind === 'portfolio' ? 'All snapshot dates' : 'All bank statement rows']
                    ).map((label) => (
                      <li
                        key={label}
                        className="max-w-full break-words rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-300"
                      >
                        {label}
                      </li>
                    ))}
                  </ul>
                )}
                {answer ? (
                  <AnswerCard
                    answer={answer}
                    onRule={(draft) => setRule({ id, draft })}
                    onOpen={(ids, excluded) => {
                      if (query) openTransactions(askEvidenceFilters(query, ids, excluded))
                    }}
                  />
                ) : (
                  <p role="status">Working on your request…</p>
                )}
              </div>
            </article>
          ))}
          <div ref={end} />
        </div>
        {undo && transactionFilters === undo.after && pathname === '/transactions' && (
          <div
            className="flex items-center justify-between border-t px-4 py-2 text-xs"
            style={{ borderColor: 'var(--border)' }}
          >
            <span>Transaction filters updated</span>
            <div className="flex gap-1.5">
              <button type="button" className={`${buttonClass} md:hidden`} onClick={onClose}>
                Show table
              </button>
              <button type="button" className={buttonClass} onClick={undoFilters}>
                Undo filters
              </button>
            </div>
          </div>
        )}
        <form onSubmit={submit} className="space-y-2 border-t p-3" style={{ borderColor: 'var(--border)' }}>
          <div className="flex gap-2">
            <input
              ref={input}
              aria-label="Ask Lokfi a question"
              className="min-w-0 flex-1 rounded-md border px-2.5 py-2 text-sm"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
              value={question}
              maxLength={1000}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask a question or request an action"
            />
            <button
              type="submit"
              aria-label="Send question"
              disabled={pending || !question.trim() || backupRevision === undefined}
              className="grid size-9 shrink-0 place-items-center rounded-md bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-40"
            >
              <ArrowUp size={17} />
            </button>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Questions go to OpenAI. Use the Description filter in Transactions for recipient names.
          </p>
        </form>
      </>
    )
  }

  return (
    <aside
      aria-labelledby={headingId}
      className="fixed inset-y-0 right-0 z-30 flex w-full max-w-[27rem] flex-col border-l text-stone-900 shadow-xl dark:text-stone-100 md:relative md:z-auto md:w-[28rem] md:shrink-0 md:shadow-none"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
    >
      <header className="flex min-h-14 items-center gap-2 border-b px-4" style={{ borderColor: 'var(--border)' }}>
        <Sparkles size={18} style={{ color: 'var(--accent)' }} />
        <div className="min-w-0 flex-1 py-1">
          <h2 id={headingId} className="font-serif text-lg">
            Ask Lokfi
          </h2>
          {assistantSettings && (
            <Link
              to="/settings/ai"
              hash="ask-lokfi-settings"
              onClick={onClose}
              title="Change model and reasoning effort"
              className="block truncate text-xs text-stone-600 hover:underline dark:text-stone-400"
            >
              {askLokfiModels[assistantSettings.model].label} ·{' '}
              {assistantSettings.reasoningEffort === 'none'
                ? 'No reasoning'
                : `${askLokfiEfforts[assistantSettings.reasoningEffort]} reasoning`}
            </Link>
          )}
        </div>
        <button
          type="button"
          aria-label="Clear conversation"
          title="Clear conversation"
          disabled={!exchanges.length}
          className="p-1.5 disabled:opacity-40"
          onClick={clearConversation}
        >
          <RotateCcw size={16} />
        </button>
        <button type="button" aria-label="Close Ask Lokfi" title="Close Ask Lokfi" className="p-1.5" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      {body}
      {rule && (
        <RuleEditorModal
          draft={rule.draft}
          onClose={() => setRule(null)}
          onSaved={() =>
            setExchanges((items) =>
              items.map((item) =>
                item.id === rule.id ? { ...item, answer: { kind: 'message', text: 'Rule saved.' } } : item
              )
            )
          }
        />
      )}
    </aside>
  )
}
