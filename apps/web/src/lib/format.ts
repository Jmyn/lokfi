// Shared formatting utilities extracted from StatsPage

export const fmt = new Intl.NumberFormat('en-SG', {
  style: 'currency',
  currency: 'SGD',
})

export function formatMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-')
  const d = new Date(Number(year), Number(month) - 1, 1)
  return d.toLocaleDateString('en-SG', { month: 'short', year: '2-digit' })
}

/** Format a Date as YYYY-MM-DD string */
export function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
