import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SessionFilters } from '@kombuse/types'
import { sessionsApi } from '../lib/api'
import { sessionKeys } from '../lib/query-keys'

export interface SessionEventsFilters {
  since_seq?: number
  event_type?: string
  limit?: number
}

export function useSessions(filters?: SessionFilters) {
  return useQuery({
    queryKey: sessionKeys.list(filters),
    queryFn: () => sessionsApi.list(filters),
    enabled: !!filters,
  })
}

export function useSessionByKombuseId(kombuseSessionId: string | null) {
  return useQuery({
    queryKey: sessionKeys.byKombuse(kombuseSessionId),
    queryFn: () => sessionsApi.get(kombuseSessionId!),
    enabled: !!kombuseSessionId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useSessionEvents(
  kombuseSessionId: string | null,
  filters?: SessionEventsFilters
) {
  return useQuery({
    queryKey: sessionKeys.events(kombuseSessionId, filters),
    queryFn: () => sessionsApi.getEvents(kombuseSessionId!, filters),
    enabled: !!kombuseSessionId,
  })
}

export function useCreateSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: sessionsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all })
    },
  })
}

export function useDeleteSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (kombuseSessionId: string) => sessionsApi.delete(kombuseSessionId),
    onMutate: (kombuseSessionId) => {
      queryClient.removeQueries({ queryKey: sessionKeys.byKombuse(kombuseSessionId) })
      queryClient.removeQueries({ queryKey: sessionKeys.events(kombuseSessionId) })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all })
    },
  })
}
