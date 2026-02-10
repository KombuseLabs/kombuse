import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SessionFilters } from '@kombuse/types'
import { sessionsApi } from '../lib/api'

export function useSessions(filters?: SessionFilters) {
  return useQuery({
    queryKey: ['sessions', filters],
    queryFn: () => sessionsApi.list(filters),
  })
}

export function useSessionByKombuseId(kombuseSessionId: string | null) {
  return useQuery({
    queryKey: ['sessions', 'by-kombuse', kombuseSessionId],
    queryFn: () => sessionsApi.getByKombuseId(kombuseSessionId!),
    enabled: !!kombuseSessionId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useSessionEvents(sessionId: string | null) {
  return useQuery({
    queryKey: ['sessions', sessionId, 'events'],
    queryFn: () => sessionsApi.getEvents(sessionId!),
    enabled: !!sessionId,
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
    mutationFn: (id: string) => sessionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}
