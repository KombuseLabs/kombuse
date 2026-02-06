'use client'

import { useMemo } from 'react'
import type { AgentActivityStatus } from '@kombuse/types'
import { useAppContext } from './use-app-context'

/**
 * Hook to get the agent activity status for a specific ticket.
 * Combines the server-pushed ticketAgentStatus with local pendingPermissions.
 * Returns 'pending' if any permission request is waiting for this ticket.
 */
export function useTicketAgentStatus(ticketId: number | null | undefined): AgentActivityStatus {
  const { ticketAgentStatus, pendingPermissions } = useAppContext()

  return useMemo(() => {
    if (!ticketId) return 'idle'

    // Check if any pending permission is for this ticket (highest priority)
    const hasPending = [...pendingPermissions.values()].some(
      (p) => p.ticketId === ticketId
    )
    if (hasPending) return 'pending'

    // Get server-pushed status
    const status = ticketAgentStatus.get(ticketId)
    return status?.status ?? 'idle'
  }, [ticketId, ticketAgentStatus, pendingPermissions])
}
