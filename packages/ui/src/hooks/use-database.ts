import { useQuery } from '@tanstack/react-query'
import type { DatabaseQueryInput } from '@kombuse/types'
import { databaseApi } from '../lib/api'

export function useDatabaseTables() {
  return useQuery({
    queryKey: ['database', 'tables'],
    queryFn: () => databaseApi.listTables(),
  })
}

export function useDatabaseQuery(input?: DatabaseQueryInput) {
  return useQuery({
    queryKey: ['database', 'query', input],
    queryFn: () => databaseApi.query(input as DatabaseQueryInput),
    enabled: !!input?.sql,
  })
}
