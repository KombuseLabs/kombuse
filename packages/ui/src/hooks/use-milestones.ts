import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateMilestoneInput, UpdateMilestoneInput } from '@kombuse/types'
import { milestonesApi } from '../lib/api'
import { milestoneKeys, ticketKeys } from '../lib/query-keys'

export function useProjectMilestones(projectId: string) {
  return useQuery({
    queryKey: milestoneKeys.project(projectId),
    queryFn: () => milestonesApi.listByProject(projectId),
    enabled: !!projectId,
  })
}

export function useMilestone(id: number) {
  return useQuery({
    queryKey: milestoneKeys.detail(id),
    queryFn: () => milestonesApi.get(id),
    enabled: id > 0,
  })
}

export function useCreateMilestone(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<CreateMilestoneInput, 'project_id'>) =>
      milestonesApi.create(projectId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: milestoneKeys.project(projectId) })
    },
  })
}

export function useUpdateMilestone(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateMilestoneInput }) =>
      milestonesApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: milestoneKeys.project(projectId) })
    },
  })
}

export function useDeleteMilestone(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => milestonesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: milestoneKeys.project(projectId) })
      queryClient.invalidateQueries({ queryKey: ticketKeys.all })
    },
  })
}
