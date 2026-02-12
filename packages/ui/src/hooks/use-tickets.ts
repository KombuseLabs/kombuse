import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { TicketFilters, TicketWithLabels, TicketWithRelations, CreateTicketInput, UpdateTicketInput } from '@kombuse/types'
import { ticketsApi } from '../lib/api'

export function useTickets(filters?: TicketFilters) {
  return useQuery({
    queryKey: ['tickets', filters],
    queryFn: () => ticketsApi.list(filters),
  })
}

export function useTicket(id: number) {
  return useQuery({
    queryKey: ['tickets', id],
    queryFn: () => ticketsApi.get(id),
    enabled: id > 0,
  })
}

export function useCreateTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTicketInput) => ticketsApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}

export function useUpdateTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateTicketInput }) =>
      ticketsApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}

export function useDeleteTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => ticketsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}

export function useMarkTicketViewed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, profileId }: { id: number; profileId: string }) =>
      ticketsApi.markViewed(id, profileId),
    onMutate: ({ id }) => {
      queryClient.setQueriesData<TicketWithLabels[]>(
        { queryKey: ['tickets'] },
        (old) => Array.isArray(old) ? old.map((t) => t.id === id ? { ...t, has_unread: 0 } : t) : old,
      )
    },
  })
}
