'use client'

import { useCallback } from 'react'
import type { UpdateTicketInput } from '@kombuse/types'
import { useAppContext } from './use-app-context'
import { useDeleteTicket, useUpdateTicket } from './use-tickets'

/**
 * Hook for ticket operations with automatic context awareness.
 * Eliminates need to pass callbacks through component tree.
 */
export function useTicketOperations() {
  const { currentTicket, setCurrentTicket } = useAppContext()

  const deleteMutation = useDeleteTicket()
  const updateMutation = useUpdateTicket()

  const deleteCurrentTicket = useCallback(async () => {
    if (!currentTicket) return
    await deleteMutation.mutateAsync({ projectId: currentTicket.project_id, ticketNumber: currentTicket.ticket_number })
    setCurrentTicket(null)
  }, [currentTicket, deleteMutation, setCurrentTicket])

  const updateCurrentTicket = useCallback(
    async (input: UpdateTicketInput) => {
      if (!currentTicket) return
      const updated = await updateMutation.mutateAsync({
        projectId: currentTicket.project_id,
        ticketNumber: currentTicket.ticket_number,
        input: { ...input, updated_by_id: 'user-1' },
      })
      setCurrentTicket(updated)
      return updated
    },
    [currentTicket, updateMutation, setCurrentTicket]
  )

  const closeTicketDetail = useCallback(() => {
    setCurrentTicket(null)
  }, [setCurrentTicket])

  return {
    // State
    currentTicket,

    // Operations
    deleteCurrentTicket,
    updateCurrentTicket,
    setCurrentTicket,
    closeTicketDetail,

    // Loading states
    isDeleting: deleteMutation.isPending,
    isUpdating: updateMutation.isPending,
  }
}
