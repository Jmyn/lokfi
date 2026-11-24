import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, X } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { db } from '../../lib/db/db'
import type { DbRule, RuleCondition } from '../../lib/db/db'
import { applyRulesToImport } from '../../lib/rules/applyRulesToImport'
import { evaluateRules, matchesCondition } from '../../lib/rules/evaluateRules'
import { CategoryCombobox } from '../transactions/CategoryCombobox'

type RuleEditorModalProps = {
  rule?: DbRule
  draft?: Pick<DbRule, 'name' | 'category' | 'conditions' | 'priority'>
  onClose: () => void
  onSaved?: (matchCount: number) => void
}

type FormValues = {
  name: string
  priority: number
  category: string
  conditions: RuleCondition[]
}

const FIELD_OPTIONS = [
  { value: 'description', label: 'Description' },
  { value: 'source', label: 'Source' },
  { value: 'accountNo', label: 'Account No' },
  { value: 'transactionValue', label: 'Amount' },
]

const STRING_OPERATIONS = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'startsWith', label: 'Starts with' },
  { value: 'regex', label: 'Matches regex' },
]

const NUMERIC_OPERATIONS = [
  { value: 'gt', label: 'Greater than' },
  { value: 'lt', label: 'Less than' },
  { value: 'between', label: 'Between' },
]

function normalizeConditions(conditions: RuleCondition[]): RuleCondition[] {
  return conditions.map((condition) => {
    if (condition.field !== 'transactionValue') return condition
    if (condition.operation !== 'between') return { ...condition, value: Number(condition.value) }
    if (typeof condition.value !== 'string') return condition
    const parts = condition.value.split(',').map((part) => Number(part.trim()))
    return { ...condition, value: [parts[0] || 0, parts[1] || 0] }
  })
}

export function RuleEditorModal({ rule, draft, onClose, onSaved }: RuleEditorModalProps) {
  const initial = rule ?? draft
  const [id] = useState(() => rule?.id || crypto.randomUUID())
  const [saveError, setSaveError] = useState('')
  const titleId = useId()
  const formId = useId()
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      name: initial?.name ?? '',
      priority: initial?.priority ?? 100,
      category: initial?.category ?? '',
      conditions: initial?.conditions?.length
        ? initial.conditions
        : [{ field: 'description', operation: 'contains', value: '' }],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'conditions',
  })

  const watchConditions = watch('conditions')
  const watchedCategory = watch('category')
  const priority = watch('priority')

  const allTransactions = useLiveQuery(() => db.transactions.toArray(), [])
  const existingRules = useLiveQuery(() => (draft ? db.rules.orderBy('priority').toArray() : []), [draft])

  // Serialize conditions to a stable string so useMemo recomputes when
  // any field/operation/value changes (watch may return the same array ref)
  const conditionsKey = JSON.stringify(watchConditions)

  const preview = useMemo(() => {
    if (!allTransactions || watchConditions.length === 0) return null
    // Only match if every condition has a non-empty value
    if (watchConditions.some((condition) => condition.value === '' || condition.value === undefined)) return null
    const validConditions = normalizeConditions(watchConditions)

    const matches: string[] = []
    let count = 0
    let changes = 0
    let manual = 0
    const proposedRules =
      draft && watchedCategory && existingRules
        ? [
            ...existingRules,
            { id, category: watchedCategory, conditions: validConditions, priority, name: '', createdAt: '' },
          ].sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : 1))
        : null
    for (const t of allTransactions) {
      if (validConditions.every((cond) => matchesCondition(t, cond))) {
        count++
        if (matches.length < 3) matches.push(t.description)
        if (t.manualCategory) manual++
        else if (proposedRules && t.category !== watchedCategory && evaluateRules(t, proposedRules) === watchedCategory)
          changes++
      }
    }
    return { count, descriptions: matches, changes: proposedRules ? changes : null, manual }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTransactions, conditionsKey, draft, existingRules, id, priority, watchedCategory])

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => e.key === 'Escape' && !isSubmitting && onClose()
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose, isSubmitting])

  const onSubmit = async (data: FormValues) => {
    setSaveError('')
    if (data.conditions.length === 0) {
      alert('Please add at least one condition.')
      return
    }

    const cleanedConditions = normalizeConditions(data.conditions)

    const record: DbRule = {
      id,
      name: data.name,
      priority: Number(data.priority),
      category: data.category,
      conditions: cleanedConditions,
      createdAt: rule?.createdAt || new Date().toISOString(),
    }

    let matchCount: number
    try {
      matchCount = await db.transaction('rw', [db.rules, db.transactions, db.categories], async () => {
        if (!(await db.categories.get(data.category))) throw new Error('Missing category')
        await db.rules.put(record)
        const allTxns = await db.transactions.toArray()
        await applyRulesToImport(allTxns.map((t) => t.id))
        return allTxns.filter((t) => !t.manualCategory && cleanedConditions.every((cond) => matchesCondition(t, cond)))
          .length
      })
    } catch {
      setSaveError('The rule could not be saved. Check that the category still exists and try again.')
      return
    }

    onClose()
    onSaved?.(matchCount)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex justify-between items-center p-4 border-b dark:border-gray-800">
          <h2 id={titleId} className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {rule ? 'Edit Rule' : 'Create Rule'}
          </h2>
          <button
            aria-label="Close rule editor"
            disabled={isSubmitting}
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          <form id={formId} onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Rule Name</label>
                <input
                  type="text"
                  {...register('name', { required: 'Name is required' })}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g., Grab Food"
                />
                {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Priority (Lower is higher)
                </label>
                <input
                  type="number"
                  {...register('priority', { required: true, valueAsNumber: true })}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Apply Category</label>
              <input type="hidden" {...register('category', { required: 'Select a category' })} />
              <CategoryCombobox
                value={watchedCategory}
                onChange={(id) => setValue('category', id, { shouldValidate: true })}
                placeholder="-- Choose Category --"
              />
              {errors.category && <p className="text-red-500 text-xs">{errors.category.message}</p>}
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Conditions (AND)</label>
                <button
                  type="button"
                  onClick={() => append({ field: 'description', operation: 'contains', value: '' })}
                  className="text-sm flex items-center gap-1 hover:underline font-medium"
                  style={{ color: 'var(--accent)' }}
                >
                  <Plus className="w-4 h-4" /> Add Condition
                </button>
              </div>

              {fields.map((field, index) => {
                const currentField = watchConditions[index]?.field
                const isNumeric = currentField === 'transactionValue'
                const ops = isNumeric ? NUMERIC_OPERATIONS : STRING_OPERATIONS
                const isBetween = watchConditions[index]?.operation === 'between'

                return (
                  <div
                    key={field.id}
                    className="flex gap-2 items-start bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border dark:border-gray-800"
                  >
                    <select
                      {...register(`conditions.${index}.field`)}
                      onChange={(e) => {
                        const newField = e.target.value as RuleCondition['field']
                        setValue(`conditions.${index}.field`, newField)
                        setValue(`conditions.${index}.operation`, newField === 'transactionValue' ? 'gt' : 'contains')
                        setValue(`conditions.${index}.value`, '')
                      }}
                      className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    >
                      {FIELD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>

                    <select
                      {...register(`conditions.${index}.operation`)}
                      className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    >
                      {ops.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>

                    <div className="flex-1">
                      <input
                        type={isNumeric && !isBetween ? 'number' : 'text'}
                        step={isNumeric && !isBetween ? '0.01' : undefined}
                        {...register(`conditions.${index}.value`, { required: true })}
                        placeholder={isBetween ? '-10, -1' : 'Value...'}
                        className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="p-2 text-gray-400 hover:text-red-500 rounded-md transition-colors"
                      title="Remove condition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
              {fields.length === 0 && <p className="text-red-500 text-xs">At least one condition is required.</p>}
            </div>

            {/* Live preview */}
            {preview && (
              <div className="rounded-lg border dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-3 space-y-2">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {preview.count === 0
                    ? 'No matching transactions'
                    : `${preview.count} matching transaction${preview.count !== 1 ? 's' : ''}`}
                </p>
                {preview.changes !== null && (
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    {preview.changes} categories would change · {preview.manual} manual categories kept
                  </p>
                )}
                {preview.descriptions.length > 0 && (
                  <ul className="space-y-1">
                    {preview.descriptions.map((desc, i) => (
                      <li key={i} className="text-xs text-gray-600 dark:text-gray-400 font-mono truncate">
                        {desc}
                      </li>
                    ))}
                    {preview.count > 3 && (
                      <li className="text-xs text-gray-400 dark:text-gray-500">+ {preview.count - 3} more</li>
                    )}
                  </ul>
                )}
              </div>
            )}
            {saveError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {saveError}
              </p>
            )}
          </form>
        </div>

        <div className="p-4 border-t dark:border-gray-800 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800/20">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            disabled={isSubmitting || (!!draft && !existingRules)}
            className="px-4 py-2 text-sm font-medium text-white rounded-md transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {isSubmitting ? 'Saving…' : 'Save Rule'}
          </button>
        </div>
      </div>
    </div>
  )
}
