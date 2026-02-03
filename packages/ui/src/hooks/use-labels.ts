import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { labelsApi } from '../lib/api'

export function useProjectLabels(projectId: string) {
  return useQuery({
    queryKey: ['labels', 'project', projectId],
    queryFn: () => labelsApi.listByProject(projectId),
    enabled: !!projectId,
  })
}

export function useTicketLabels(ticketId: number) {
  return useQuery({
    queryKey: ['labels', 'ticket', ticketId],
    queryFn: () => labelsApi.getTicketLabels(ticketId),
    enabled: ticketId > 0,
  })
}

export function useAddLabelToTicket(ticketId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ labelId, addedById }: { labelId: number; addedById?: string }) =>
      labelsApi.addToTicket(ticketId, labelId, addedById),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', 'ticket', ticketId] })
      queryClient.invalidateQueries({ queryKey: ['tickets', ticketId] })
    },
  })
}

export function useRemoveLabelFromTicket(ticketId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (labelId: number) => labelsApi.removeFromTicket(ticketId, labelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', 'ticket', ticketId] })
      queryClient.invalidateQueries({ queryKey: ['tickets', ticketId] })
    },
  })
}

export function useCreateLabel(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; color: string; description?: string }) =>
      labelsApi.create(projectId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', 'project', projectId] })
    },
  })
}

export function useUpdateLabel(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: number
      input: { name?: string; color?: string; description?: string }
    }) => labelsApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', 'project', projectId] })
    },
  })
}

export function useDeleteLabel(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => labelsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', 'project', projectId] })
    },
  })
}
