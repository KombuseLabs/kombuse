'use client'

import { useCallback } from 'react'
import { useAppContext } from './use-app-context'
import {
  useProjectMilestones,
  useCreateMilestone,
  useUpdateMilestone,
  useDeleteMilestone,
} from './use-milestones'

export function useMilestoneOperations() {
  const { currentTicket, currentProjectId } = useAppContext()

  const projectId = currentProjectId ?? ''

  const { data: projectMilestones, isLoading: isLoadingMilestones } =
    useProjectMilestones(projectId)

  const createMutation = useCreateMilestone(projectId)
  const updateMutation = useUpdateMilestone(projectId)
  const deleteMutation = useDeleteMilestone(projectId)

  const currentMilestone = projectMilestones?.find(
    (m) => m.id === currentTicket?.milestone_id
  ) ?? null

  const createMilestone = useCallback(
    (data: { title: string; description?: string; due_date?: string }) => {
      return createMutation.mutateAsync(data)
    },
    [createMutation]
  )

  const updateMilestone = useCallback(
    (
      id: number,
      data: { title?: string; description?: string | null; due_date?: string | null; status?: 'open' | 'closed' }
    ) => {
      return updateMutation.mutateAsync({ id, input: data })
    },
    [updateMutation]
  )

  const deleteMilestone = useCallback(
    (id: number) => {
      return deleteMutation.mutateAsync(id)
    },
    [deleteMutation]
  )

  return {
    projectMilestones: projectMilestones ?? [],
    currentMilestone,

    createMilestone,
    updateMilestone,
    deleteMilestone,

    isLoading: isLoadingMilestones,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
