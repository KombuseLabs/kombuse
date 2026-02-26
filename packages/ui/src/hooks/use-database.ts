import { useQuery } from '@tanstack/react-query'
import type { DatabaseQueryInput } from '@kombuse/types'
import { databaseApi } from '../lib/api'
import { databaseKeys } from '../lib/query-keys'

export function useDatabaseTables() {
  return useQuery({
    queryKey: databaseKeys.tables(),
    queryFn: () => databaseApi.listTables(),
  })
}

export function useDatabaseQuery(input?: DatabaseQueryInput) {
  return useQuery({
    queryKey: databaseKeys.query(input),
    queryFn: () => databaseApi.query(input as DatabaseQueryInput),
    enabled: !!input?.sql,
  })
}
