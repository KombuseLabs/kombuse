import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { LabelFilters } from '@kombuse/types'
import { labelsApi } from '../lib/api'

type ProjectLabelListOptions = Pick<LabelFilters, 'search' | 'sort' | 'usage_scope'>

export function useProjectLabels(projectId: string, options?: ProjectLabelListOptions) {
  const search = options?.search ?? null
  const sort = options?.sort ?? null
  const usageScope = options?.usage_scope ?? null

  return useQuery({
    queryKey: ['labels', 'project', projectId, { search, sort, usageScope }],
    queryFn: () => labelsApi.listByProject(projectId, options),
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
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}

export function useRemoveLabelFromTicket(ticketId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ labelId, removedById }: { labelId: number; removedById?: string }) =>
      labelsApi.removeFromTicket(ticketId, labelId, removedById),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', 'ticket', ticketId] })
      queryClient.invalidateQueries({ queryKey: ['tickets', ticketId] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
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
