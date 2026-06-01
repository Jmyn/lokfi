const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'holdings', label: 'Holdings' },
  { id: 'closed', label: 'Closed' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'dividends', label: 'Dividends' },
  { id: 'signals', label: 'Signals' },
] as const

interface InvestmentsTabsProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

export function InvestmentsTabs({ activeTab, onTabChange }: InvestmentsTabsProps) {
  return (
    <div className="border-b overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
      <div className="flex gap-1 min-w-max">
        {TABS.map((t) => {
          const isActive = t.id === activeTab
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                isActive
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
              style={
                isActive
                  ? {
                      borderColor: 'var(--accent)',
                      backgroundColor: 'var(--accent-subtle)',
                    }
                  : { borderColor: 'transparent' }
              }
            >
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
