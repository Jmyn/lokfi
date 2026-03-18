import { useState } from 'react'
import { Plus, Settings2, Trash2, Edit3, Beaker, ArrowRight } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/db'
import type { DbRule, DbTransaction } from '../../lib/db/db'
import { evaluateRules } from '../../lib/rules/evaluateRules'
import { RuleEditorModal } from './RuleEditorModal'

export function RulesPage() {
  const [editorRule, setEditorRule] = useState<DbRule | 'CREATE' | null>(null)

  // Subscriptions
  const rules = useLiveQuery(() => db.rules.orderBy('priority').toArray()) ?? []
  const categories = useLiveQuery(() => db.categories.toArray()) ?? []
  const catMap = new Map(categories.map(c => [c.id, c]))

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this rule?')) {
      await db.rules.delete(id)
    }
  }

  // --- Simulator State ---
  const [simDesc, setSimDesc] = useState('')
  const [simSrc, setSimSrc] = useState('')
  const [simVal, setSimVal] = useState('')
  const [simResult, setSimResult] = useState<{ catName: string, ruleName: string } | 'NO_MATCH' | null>(null)

  const handleSimulate = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Construct mock transaction
    const mockTxn = {
      description: simDesc,
      source: simSrc,
      transactionValue: Number(simVal),
      accountNo: '',
    } as unknown as DbTransaction // Cast for simulator purpose

    const matchCatId = evaluateRules(mockTxn, rules)
    if (!matchCatId) {
      setSimResult('NO_MATCH')
    } else {
      // Actually to do it right, we'll re-run evaluate logic to find the specific rule
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
        if (hasMatch) {
          foundRule = r
          break
        }
      }

      if (foundRule) {
        const cat = catMap.get(foundRule.category)
        setSimResult({
          ruleName: foundRule.name,
          catName: cat ? cat.name : 'Unknown Category'
        })
      } else {
        setSimResult('NO_MATCH')
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-12">
      <div className="mx-auto max-w-4xl flex flex-col gap-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Settings2 className="w-6 h-6 text-gray-500" />
              Categorisation Rules
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
              Automatically categorize transactions when importing statements.
            </p>
          </div>
          <button
            onClick={() => setEditorRule('CREATE')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Add Rule
          </button>
        </div>

        {/* Rule Simulator */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Beaker className="w-5 h-5 text-purple-500" /> Rule Simulator
          </h2>
          <form onSubmit={handleSimulate} className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 space-y-1 w-full">
              <label className="text-xs font-medium text-gray-500">Transaction Description</label>
              <input 
                type="text" 
                value={simDesc} onChange={e => setSimDesc(e.target.value)}
                placeholder="e.g. GRABFOOD"
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="w-full sm:w-32 space-y-1">
              <label className="text-xs font-medium text-gray-500">Amount</label>
              <input 
                type="number" step="0.01"
                value={simVal} onChange={e => setSimVal(e.target.value)}
                placeholder="-15.00"
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="w-full sm:w-32 space-y-1">
              <label className="text-xs font-medium text-gray-500">Source</label>
              <input 
                type="text"
                value={simSrc} onChange={e => setSimSrc(e.target.value)}
                placeholder="ocbc"
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <button type="submit" className="px-4 py-2 bg-gray-800 dark:bg-gray-700 text-white rounded-md text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-600 w-full sm:w-auto">
              Run
            </button>
          </form>

          {simResult && (
            <div className={`mt-4 p-3 rounded-md text-sm flex items-center gap-2 border ${
              simResult === 'NO_MATCH' 
                ? 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700' 
                : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/30'
            }`}>
              {simResult === 'NO_MATCH' ? (
                'No rules match — transaction would remain uncategorised.'
              ) : (
                <>
                  Matched Rule: <strong>{simResult.ruleName}</strong> <ArrowRight className="w-4 h-4" /> <strong>{simResult.catName}</strong>
                </>
              )}
            </div>
          )}
        </div>

        {/* Rule List */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          {rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <Settings2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">No rules yet</h3>
              <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-sm mb-6">
                Rules scan your transaction descriptions automatically upon import and assign categories.
              </p>
              <button
                onClick={() => setEditorRule('CREATE')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-sm font-medium"
              >
                Create your first rule
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {rules.map((rule) => {
                const category = catMap.get(rule.category)
                
                return (
                  <div key={rule.id} className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 text-xs font-bold shrink-0">
                      {rule.priority}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 truncate">
                          {rule.name}
                        </h3>
                        {category && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300">
                            <span 
                              className="w-2 h-2 rounded-full mr-1.5" 
                              style={{ backgroundColor: category.color }} 
                            />
                            {category.name}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {rule.conditions?.map((c, i) => (
                          <span key={i}>
                            {i > 0 && <span className="mx-1 text-xs font-bold text-gray-300">AND</span>}
                            <span>{c.field} {c.operation} "{Array.isArray(c.value) ? c.value.join(' to ') : c.value}"</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setEditorRule(rule)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-800 rounded-md transition-colors"
                        title="Edit rule"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-gray-800 rounded-md transition-colors"
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
        />
      )}

    </div>
  )
}
