import { useQuery } from '@tanstack/react-query'
import type { EventFilters } from '@kombuse/types'
import { eventsApi } from '../lib/api'

export function useEvents(filters?: EventFilters) {
  return useQuery({
    queryKey: ['events', filters],
    queryFn: () => eventsApi.list(filters),
  })
}
