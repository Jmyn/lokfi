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
