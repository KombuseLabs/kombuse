import { useQuery } from '@tanstack/react-query'
import type { EventFilters } from '@kombuse/types'
import { eventsApi } from '../lib/api'
import { eventKeys } from '../lib/query-keys'

export function useEvents(filters?: EventFilters) {
  return useQuery({
    queryKey: eventKeys.list(filters),
    queryFn: () => eventsApi.list(filters),
  })
}
