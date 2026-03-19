import { useState } from 'react'
import { Plus, FlaskConical, Trash2, Edit3, ArrowRight, Wand2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/db'
import type { DbRule, DbTransaction } from '../../lib/db/db'
import { evaluateRules } from '../../lib/rules/evaluateRules'
import { RuleEditorModal } from './RuleEditorModal'

export function RulesPage() {
  const [editorRule, setEditorRule] = useState<DbRule | 'CREATE' | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const rules = useLiveQuery(async () => {
    const all = await db.rules.toArray()
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }) ?? []
  const categories = useLiveQuery(() => db.categories.toArray()) ?? []
  const catMap = new Map(categories.map(c => [c.id, c]))

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this rule?')) {
      await db.rules.delete(id)
    }
  }

  // Simulator state
  const [simDesc, setSimDesc] = useState('')
  const [simSrc, setSimSrc] = useState('')
  const [simVal, setSimVal] = useState('')
  const [simResult, setSimResult] = useState<{ catName: string; ruleName: string } | 'NO_MATCH' | null>(null)

  const handleSimulate = (e: React.FormEvent) => {
    e.preventDefault()
    const mockTxn = {
      description: simDesc,
      source: simSrc,
      transactionValue: Number(simVal),
      accountNo: '',
    } as unknown as DbTransaction

    const matchCatId = evaluateRules(mockTxn, rules)
    if (!matchCatId) {
      setSimResult('NO_MATCH')
    } else {
      const sortedRules = [...rules].sort((a, b) => a.priority - b.priority)
      let foundRule = null
      for (const r of sortedRules) {
        if (!r.conditions || !r.conditions.length) continue
        const hasMatch = r.conditions.every(cond => {
          const fieldVal = mockTxn[cond.field]
          if (fieldVal === undefined) return false
          if (cond.field === 'transactionValue') {
            const nv = Number(fieldVal)
            if (cond.operation === 'gt') return nv > Number(cond.value)
            if (cond.operation === 'lt') return nv < Number(cond.value)
            if (cond.operation === 'between' && Array.isArray(cond.value)) return nv >= cond.value[0] && nv <= cond.value[1]
            return false
          }
          const sv = String(fieldVal).toLowerCase()
          const cv = String(cond.value).toLowerCase()
          if (cond.operation === 'contains') return sv.includes(cv)
          if (cond.operation === 'equals') return sv === cv
          if (cond.operation === 'startsWith') return sv.startsWith(cv)
          if (cond.operation === 'regex') return (new RegExp(String(cond.value), 'i')).test(String(fieldVal))
          return false
        })
        if (hasMatch) { foundRule = r; break }
      }
      if (foundRule) {
        const cat = catMap.get(foundRule.category)
        setSimResult({ ruleName: foundRule.name, catName: cat ? cat.name : 'Unknown Category' })
      } else {
        setSimResult('NO_MATCH')
      }
    }
  }

  const inputCls =
    'rounded-lg border bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 w-full transition-colors'

  return (
    <div className="min-h-screen px-6 py-10" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="mx-auto max-w-4xl flex flex-col gap-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="font-serif text-2xl text-gray-900 dark:text-gray-100">
              Categorisation Rules
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Automatically categorize transactions when importing statements.
            </p>
          </div>
          <button
            onClick={() => setEditorRule('CREATE')}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium transition-opacity hover:opacity-90 shrink-0"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Plus className="w-4 h-4" /> Add Rule
          </button>
        </div>

        {/* Rule Simulator */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
        >
          <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
            <FlaskConical className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Rule Simulator</h2>
          </div>
          <div className="px-5 py-4">
            <form onSubmit={handleSimulate} className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 space-y-1 w-full">
                <label className="text-xs font-medium text-gray-500">Transaction Description</label>
                <input
                  type="text"
                  value={simDesc}
                  onChange={e => setSimDesc(e.target.value)}
                  placeholder="e.g. GRABFOOD"
                  className={inputCls}
                  style={{ borderColor: 'var(--border)' }}
                />
              </div>
              <div className="w-full sm:w-32 space-y-1">
                <label className="text-xs font-medium text-gray-500">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={simVal}
                  onChange={e => setSimVal(e.target.value)}
                  placeholder="-15.00"
                  className={inputCls}
                  style={{ borderColor: 'var(--border)' }}
                />
              </div>
              <div className="w-full sm:w-32 space-y-1">
                <label className="text-xs font-medium text-gray-500">Source</label>
                <input
                  type="text"
                  value={simSrc}
                  onChange={e => setSimSrc(e.target.value)}
                  placeholder="ocbc"
                  className={inputCls}
                  style={{ borderColor: 'var(--border)' }}
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2 text-white rounded-lg text-sm font-medium transition-opacity hover:opacity-90 w-full sm:w-auto shrink-0"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                Run
              </button>
            </form>

            {rules.length === 0 && (
              <p className="mt-3 text-xs" style={{ color: 'var(--accent)' }}>
                No rules saved yet — create a rule above first, then use the simulator to test it.
              </p>
            )}

            {simResult && (
              <div
                className={`mt-4 p-3 rounded-lg text-sm flex items-center gap-2 border`}
                style={
                  simResult === 'NO_MATCH'
                    ? { backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: '#6b7280' }
                    : { backgroundColor: 'var(--accent-subtle)', borderColor: 'var(--accent)', color: 'var(--accent-text)' }
                }
              >
                {simResult === 'NO_MATCH' ? (
                  'No rules match — transaction would remain uncategorised.'
                ) : (
                  <>
                    Matched: <strong>{simResult.ruleName}</strong>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    <strong>{simResult.catName}</strong>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Rule List */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
        >
          {rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div
                className="flex items-center justify-center w-12 h-12 rounded-2xl mb-4"
                style={{ backgroundColor: 'var(--accent-subtle)' }}
              >
                <Wand2 className="w-6 h-6" style={{ color: 'var(--accent)' }} />
              </div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">No rules yet</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm mb-6">
                Rules scan your transaction descriptions automatically upon import and assign categories.
              </p>
              <button
                onClick={() => setEditorRule('CREATE')}
                className="px-4 py-2 text-white rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                Create your first rule
              </button>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {rules.map((rule) => {
                const category = catMap.get(rule.category)
                return (
                  <div
                    key={rule.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center hover:opacity-80 transition-opacity"
                  >
                    <div
                      className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0"
                      style={{
                        backgroundColor: 'var(--accent-subtle)',
                        color: 'var(--accent)',
                      }}
                    >
                      {rule.priority}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {rule.name}
                        </h3>
                        {category && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full mr-1.5"
                              style={{ backgroundColor: category.color }}
                            />
                            {category.name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono">
                        {rule.conditions?.map((c, i) => (
                          <span key={i}>
                            {i > 0 && <span className="mx-1.5 font-sans font-semibold text-gray-300 dark:text-gray-600">AND</span>}
                            <span>{c.field} {c.operation} "{Array.isArray(c.value) ? c.value.join(' to ') : c.value}"</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setEditorRule(rule)}
                        className="p-2 rounded-lg transition-colors text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        style={{ '--hover-bg': 'var(--border)' } as React.CSSProperties}
                        title="Edit rule"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="p-2 rounded-lg transition-colors text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        title="Delete rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

      {editorRule && (
        <RuleEditorModal
          rule={editorRule === 'CREATE' ? undefined : editorRule}
          onClose={() => setEditorRule(null)}
          onSaved={(count) => {
            setToast(`Rule saved — ${count} transaction${count !== 1 ? 's' : ''} categorized`)
            setTimeout(() => setToast(null), 3500)
          }}
        />
      )}

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm font-medium text-white shadow-lg z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
