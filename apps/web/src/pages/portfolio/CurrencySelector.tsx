import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { CURRENCIES, type CurrencyOption } from './currencyPreference'

interface CurrencySelectorProps {
  value: CurrencyOption
  onChange: (c: CurrencyOption) => void
}

/**
 * Dropdown component for selecting the portfolio display currency.
 * Uses native select element styled with Tailwind for simplicity and accessibility.
 */
export function CurrencySelector({ value, onChange }: CurrencySelectorProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors"
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {value}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 mt-1 z-20 min-w-[100px] rounded-xl border overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-sidebar)',
              borderColor: 'var(--border)',
            }}
          >
            {CURRENCIES.map((currency) => (
              <div
                key={currency}
                onClick={() => {
                  onChange(currency)
                  setOpen(false)
                }}
                className="px-3 py-2 text-sm cursor-pointer transition-colors"
                style={{
                  color: currency === value ? 'var(--accent)' : 'var(--text-primary)',
                  backgroundColor: currency === value ? 'var(--bg)' : 'transparent',
                }}
              >
                {currency}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
