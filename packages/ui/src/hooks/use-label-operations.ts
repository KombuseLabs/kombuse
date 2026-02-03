'use client'

import { useCallback } from 'react'
import { useAppContext } from './use-app-context'
import {
  useProjectLabels,
  useTicketLabels,
  useAddLabelToTicket,
  useRemoveLabelFromTicket,
  useCreateLabel,
  useUpdateLabel,
  useDeleteLabel,
} from './use-labels'

/**
 * Hook for label operations on the current ticket.
 * Automatically uses currentTicket and currentProjectId from AppContext.
 */
export function useLabelOperations() {
  const { currentTicket, currentProjectId } = useAppContext()

  const ticketId = currentTicket?.id ?? 0
  const projectId = currentProjectId ?? ''

  // Queries
  const { data: projectLabels, isLoading: isLoadingProject } =
    useProjectLabels(projectId)
  const { data: ticketLabels, isLoading: isLoadingTicket } =
    useTicketLabels(ticketId)

  // Mutations
  const addMutation = useAddLabelToTicket(ticketId)
  const removeMutation = useRemoveLabelFromTicket(ticketId)
  const createMutation = useCreateLabel(projectId)
  const updateMutation = useUpdateLabel(projectId)
  const deleteMutation = useDeleteLabel(projectId)

  // Wrapped operations
  const addLabel = useCallback(
    (labelId: number, addedById?: string) => {
      return addMutation.mutateAsync({ labelId, addedById })
    },
    [addMutation]
  )

  const removeLabel = useCallback(
    (labelId: number) => {
      return removeMutation.mutateAsync(labelId)
    },
    [removeMutation]
  )

  const createLabel = useCallback(
    (data: { name: string; color: string; description?: string }) => {
      return createMutation.mutateAsync(data)
    },
    [createMutation]
  )

  const updateLabel = useCallback(
    (
      id: number,
      data: { name?: string; color?: string; description?: string }
    ) => {
      return updateMutation.mutateAsync({ id, input: data })
    },
    [updateMutation]
  )

  const deleteLabel = useCallback(
    (id: number) => {
      return deleteMutation.mutateAsync(id)
    },
    [deleteMutation]
  )

  return {
    // Data
    projectLabels: projectLabels ?? [],
    ticketLabels: ticketLabels ?? [],

    // Operations
    addLabel,
    removeLabel,
    createLabel,
    updateLabel,
    deleteLabel,

    // Loading states
    isLoading: isLoadingProject || isLoadingTicket,
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
