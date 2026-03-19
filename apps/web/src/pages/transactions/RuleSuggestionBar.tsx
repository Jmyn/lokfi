import { useState } from 'react'
import type { RuleSuggestion } from '../../lib/rules/suggestRules'
import type { RuleCondition } from '../../lib/db/db'

interface Props {
  suggestions: RuleSuggestion[]
  categoryName: string
  onCreateRule: (suggestion: RuleSuggestion) => void
  onCustomize: (suggestion: RuleSuggestion) => void
  onDismiss: () => void
}

const LABEL_DISPLAY: Record<RuleSuggestion['label'], string> = {
  suggested: 'Suggested',
  exact: 'Exact',
}

const MAX_VALUE_LENGTH = 30

function truncate(value: string): string {
  if (typeof value !== 'string' || value.length <= MAX_VALUE_LENGTH) return value
  return value.slice(0, MAX_VALUE_LENGTH) + '…'
}

function describeCondition(c: RuleCondition): string {
  if (c.field === 'description') return `desc ${c.operation} "${truncate(String(c.value))}"`
  if (c.field === 'source') return `source = "${c.value}"`
  return `${c.field} ${c.operation} ${c.value}`
}

function describeConditions(conditions: RuleCondition[]): string {
  return conditions.map(describeCondition).join(' · ')
}

export function RuleSuggestionBar({
  suggestions,
  categoryName,
  onCreateRule,
  onCustomize,
  onDismiss,
}: Props) {
  const [selected, setSelected] = useState<RuleSuggestion>(suggestions[0])
  const showPills = suggestions.length > 1

  return (
    <div
      className="sticky bottom-0 border-t shadow-lg animate-in slide-in-from-bottom-2 duration-200"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-3 pb-1">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          ✨ Suggest a rule for
          <span
            className="px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)' }}
          >
            {categoryName}
          </span>
        </span>
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-lg leading-none"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>

      {/* Pill row (2 suggestions) or inline condition (1 suggestion) */}
      <div className="flex items-center gap-2 px-5 py-2">
        {showPills ? (
          suggestions.map((s) => {
            const isActive = s.label === selected.label
            return (
              <button
                key={s.label}
                onClick={() => setSelected(s)}
                className="flex flex-col items-start px-3 py-1.5 rounded-lg border text-xs transition-colors"
                style={
                  isActive
                    ? {
                        borderColor: 'var(--accent)',
                        backgroundColor: 'var(--accent-subtle)',
                        color: 'var(--accent)',
                      }
                    : {
                        borderColor: 'var(--border)',
                        backgroundColor: 'transparent',
                        color: 'var(--text-muted)',
                      }
                }
              >
                <span className="font-semibold">
                  {LABEL_DISPLAY[s.label]} · {s.matchCount} tx
                </span>
                <span className="opacity-70 font-mono">{describeConditions(s.conditions)}</span>
              </button>
            )
          })
        ) : (
          <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
            {describeConditions(selected.conditions)} · {selected.matchCount} tx
          </span>
        )}

        {/* Preview */}
        {selected.previewDescriptions.length > 0 && (
          <span className="ml-3 text-xs text-gray-400 dark:text-gray-500 truncate max-w-sm">
            e.g. {selected.previewDescriptions.join(', ')}
            {selected.matchCount > selected.previewDescriptions.length ? ` + ${selected.matchCount - selected.previewDescriptions.length} more` : ''}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 px-5 pb-3">
        <button
          onClick={() => onCustomize(selected)}
          className="text-sm font-medium hover:underline"
          style={{ color: 'var(--accent)' }}
        >
          Customize ↗
        </button>
        <button
          onClick={() => onCreateRule(selected)}
          className="px-4 py-1.5 text-white text-sm rounded-full font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          Create Rule →
        </button>
      </div>
    </div>
  )
}
