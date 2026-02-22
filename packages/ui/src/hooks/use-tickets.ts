import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { TicketFilters, TicketWithLabels, CreateTicketInput, UpdateTicketInput } from '@kombuse/types'
import { ticketsApi } from '../lib/api'

export function useTickets(filters?: TicketFilters) {
  return useQuery({
    queryKey: ['tickets', filters],
    queryFn: () => ticketsApi.list(filters),
  })
}

export function useTicketByNumber(projectId: string | undefined, ticketNumber: number) {
  return useQuery({
    queryKey: ['tickets', 'by-number', projectId, ticketNumber],
    queryFn: () => ticketsApi.getByNumber(projectId!, ticketNumber),
    enabled: !!projectId && ticketNumber > 0,
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
    mutationFn: ({ projectId, ticketNumber, input }: { projectId: string; ticketNumber: number; input: UpdateTicketInput }) =>
      ticketsApi.update(projectId, ticketNumber, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}

export function useDeleteTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, ticketNumber }: { projectId: string; ticketNumber: number }) =>
      ticketsApi.delete(projectId, ticketNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}

export function useMarkTicketViewed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, ticketNumber, profileId }: { projectId: string; ticketNumber: number; profileId: string }) =>
      ticketsApi.markViewed(projectId, ticketNumber, profileId),
    onMutate: ({ projectId, ticketNumber }) => {
      queryClient.setQueriesData<TicketWithLabels[]>(
        { queryKey: ['tickets'] },
        (old) => Array.isArray(old) ? old.map((t) => t.project_id === projectId && t.ticket_number === ticketNumber ? { ...t, has_unread: 0 } : t) : old,
      )
    },
  })
}

export function useTicketStatusCounts(projectId: string) {
  return useQuery({
    queryKey: ['tickets', 'counts', projectId],
    queryFn: () => ticketsApi.statusCounts(projectId),
    enabled: !!projectId,
  })
}
