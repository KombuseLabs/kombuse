import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SessionFilters } from '@kombuse/types'
import { sessionsApi } from '../lib/api'

export interface SessionEventsFilters {
  since_seq?: number
  event_type?: string
  limit?: number
}

export function useSessions(filters?: SessionFilters) {
  return useQuery({
    queryKey: ['sessions', filters],
    queryFn: () => sessionsApi.list(filters),
  })
}

export function useSessionByKombuseId(kombuseSessionId: string | null) {
  return useQuery({
    queryKey: ['sessions', 'by-kombuse', kombuseSessionId],
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
    queryKey: ['sessions', kombuseSessionId, 'events', filters],
    queryFn: () => sessionsApi.getEvents(kombuseSessionId!, filters),
    enabled: !!kombuseSessionId,
  })
}

export function useCreateSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: sessionsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

export function useDeleteSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (kombuseSessionId: string) => sessionsApi.delete(kombuseSessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}
