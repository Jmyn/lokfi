export type SourceType = 'all' | 'bank' | 'brokerage'

export interface Filters {
  dateFrom: string
  dateTo: string
  sources: string[]
  accounts: string[]
  noAccounts?: boolean
  categoryId: string
  sourceType: SourceType
  type: string
  description?: string
  categoryIds?: string[]
  excludedCategoryIds?: string[]
  excludeTransfers?: boolean
  excludeInvestments?: boolean
  resultRowIds?: ReadonlySet<string>
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
