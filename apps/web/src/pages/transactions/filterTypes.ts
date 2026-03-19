import type { StatementSource } from '@lokfi/parser-core'

export interface Filters {
  dateFrom: string
  dateTo: string
  sources: StatementSource[]
  accounts: string[]
  categoryId: string
}

export const defaultFilters: Filters = {
  dateFrom: '',
  dateTo: '',
  sources: [],
  accounts: [],
  categoryId: '',
}
