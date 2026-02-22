import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { LabelFilters } from '@kombuse/types'
import { labelsApi } from '../lib/api'

type ProjectLabelListOptions = Pick<LabelFilters, 'search' | 'sort' | 'usage_scope' | 'is_enabled'>

export function useProjectLabels(projectId: string, options?: ProjectLabelListOptions) {
  const search = options?.search ?? null
  const sort = options?.sort ?? null
  const usageScope = options?.usage_scope ?? null
  const isEnabled = options?.is_enabled ?? null

  return useQuery({
    queryKey: ['labels', 'project', projectId, { search, sort, usageScope, isEnabled }],
    queryFn: () => labelsApi.listByProject(projectId, options),
    enabled: !!projectId,
  })
}

export function useTicketLabels(projectId: string, ticketNumber: number) {
  return useQuery({
    queryKey: ['labels', 'ticket', projectId, ticketNumber],
    queryFn: () => labelsApi.getTicketLabels(projectId, ticketNumber),
    enabled: !!projectId && ticketNumber > 0,
  })
}

export function useAddLabelToTicket(projectId: string, ticketNumber: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ labelId, addedById }: { labelId: number; addedById?: string }) =>
      labelsApi.addToTicket(projectId, ticketNumber, labelId, addedById),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', 'ticket', projectId, ticketNumber] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}

export function useRemoveLabelFromTicket(projectId: string, ticketNumber: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ labelId, removedById }: { labelId: number; removedById?: string }) =>
      labelsApi.removeFromTicket(projectId, ticketNumber, labelId, removedById),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', 'ticket', projectId, ticketNumber] })
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
