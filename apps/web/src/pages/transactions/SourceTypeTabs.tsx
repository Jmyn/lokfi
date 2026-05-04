import type { SourceType } from './filterTypes'

interface SourceTypeTabsProps {
  value: SourceType
  onChange: (value: SourceType) => void
}

const TABS: { key: SourceType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'bank', label: 'Bank' },
  { key: 'brokerage', label: 'Brokerage' },
]

export function SourceTypeTabs({ value, onChange }: SourceTypeTabsProps) {
  return (
    <div className="flex items-center gap-1">
      {TABS.map((tab) => {
        const active = value === tab.key
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className="text-xs font-medium px-3 py-1.5 rounded-full border transition-colors"
            style={
              active
                ? {
                    backgroundColor: 'var(--accent)',
                    borderColor: 'var(--accent)',
                    color: '#fff',
                  }
                : {
                    backgroundColor: 'var(--bg)',
                    borderColor: 'var(--border)',
                    color: 'var(--tw-text-opacity, currentColor)',
                  }
            }
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
