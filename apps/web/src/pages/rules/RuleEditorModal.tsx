import { useEffect } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, X } from 'lucide-react'
import { db } from '../../lib/db/db'
import type { DbRule, RuleCondition } from '../../lib/db/db'

type RuleEditorModalProps = {
  rule?: DbRule
  onClose: () => void
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

export function RuleEditorModal({ rule, onClose }: RuleEditorModalProps) {
  const categories = useLiveQuery(() => db.categories.toArray()) ?? []

  const { register, control, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      name: rule?.name ?? '',
      priority: rule?.priority ?? 100,
      category: rule?.category ?? '',
      conditions: rule?.conditions?.length ? rule.conditions : [{ field: 'description', operation: 'contains', value: '' }]
    }
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'conditions'
  })

  const watchConditions = watch('conditions')

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const onSubmit = async (data: FormValues) => {
    if (data.conditions.length === 0) {
      alert("Please add at least one condition.")
      return
    }

    const cleanedConditions = data.conditions.map(cond => {
      if (cond.field === 'transactionValue') {
        if (cond.operation === 'between') {
          // If it's stored as a string "a,b"
          if (typeof cond.value === 'string') {
            const parts = cond.value.split(',').map(n => Number(n.trim()))
            return { ...cond, value: [parts[0] || 0, parts[1] || 0] as [number, number] }
          }
        } else {
          return { ...cond, value: Number(cond.value) }
        }
      }
      return cond
    }) as RuleCondition[]

    const record: DbRule = {
      id: rule?.id || crypto.randomUUID(),
      name: data.name,
      priority: Number(data.priority),
      category: data.category,
      conditions: cleanedConditions,
      createdAt: rule?.createdAt || new Date().toISOString()
    }

    await db.rules.put(record)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b dark:border-gray-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {rule ? 'Edit Rule' : 'Create Rule'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          <form id="rule-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            
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
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Priority (Lower is higher)</label>
                <input
                  type="number"
                  {...register('priority', { required: true, valueAsNumber: true })}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Apply Category</label>
              <select
                {...register('category', { required: 'Select a category' })}
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">-- Choose Category --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {errors.category && <p className="text-red-500 text-xs">{errors.category.message}</p>}
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Conditions (AND)</label>
                <button
                  type="button"
                  onClick={() => append({ field: 'description', operation: 'contains', value: '' })}
                  className="text-sm flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
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
                  <div key={field.id} className="flex gap-2 items-start bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border dark:border-gray-800">
                    <select
                      {...register(`conditions.${index}.field`)}
                      className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    >
                      {FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>

                    <select
                      {...register(`conditions.${index}.operation`)}
                      className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    >
                      {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>

                    <div className="flex-1">
                      <input
                        type={isNumeric && !isBetween ? "number" : "text"}
                        step={isNumeric && !isBetween ? "0.01" : undefined}
                        {...register(`conditions.${index}.value`, { required: true })}
                        placeholder={isBetween ? "-10, -1" : "Value..."}
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
              {fields.length === 0 && (
                 <p className="text-red-500 text-xs">At least one condition is required.</p>
              )}
            </div>

          </form>
        </div>

        <div className="p-4 border-t dark:border-gray-800 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="rule-form"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
          >
            Save Rule
          </button>
        </div>
      </div>
    </div>
  )
}
