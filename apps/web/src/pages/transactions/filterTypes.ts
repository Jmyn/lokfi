export type SourceType = 'all' | 'bank' | 'brokerage'

export interface Filters {
  dateFrom: string
  dateTo: string
  sources: string[]
  accounts: string[]
  categoryId: string
  sourceType: SourceType
  type: string
}

export const defaultFilters: Filters = {
  dateFrom: '',
  dateTo: '',
  sources: [],
  accounts: [],
  categoryId: '',
  sourceType: 'all',
  type: '',
}
