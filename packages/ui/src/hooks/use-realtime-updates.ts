import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { WebSocketEvent, EventType } from '@kombuse/types'
import { EVENT_TYPES } from '@kombuse/types'
import { useWebSocket } from './use-websocket'

interface UseRealtimeUpdatesOptions {
  projectId?: string
  ticketId?: number
}

interface UseRealtimeUpdatesReturn {
  isConnected: boolean
}

/**
 * Hook that connects to WebSocket and automatically invalidates
 * relevant React Query caches when events are received.
 *
 * Requires WebSocketProvider to be in the component tree.
 *
 * @param options.projectId - Subscribe to all events for this project
 * @param options.ticketId - Subscribe to all events for this ticket
 *
 * @example
 * // In a ticket list view
 * const { isConnected } = useRealtimeUpdates({ projectId: 'proj-1' })
 *
 * @example
 * // In a ticket detail view
 * const { isConnected } = useRealtimeUpdates({ ticketId: 123 })
 */
export function useRealtimeUpdates({
  projectId,
  ticketId,
}: UseRealtimeUpdatesOptions = {}): UseRealtimeUpdatesReturn {
  const queryClient = useQueryClient()

  const handleEvent = useCallback(
    (event: WebSocketEvent) => {
      const eventType = event.event_type as EventType

      switch (eventType) {
        case EVENT_TYPES.TICKET_CREATED:
        case EVENT_TYPES.TICKET_UPDATED:
        case EVENT_TYPES.TICKET_CLOSED:
        case EVENT_TYPES.TICKET_REOPENED:
        case EVENT_TYPES.TICKET_CLAIMED:
        case EVENT_TYPES.TICKET_UNCLAIMED:
          // Invalidate ticket list queries (with any filters)
          queryClient.invalidateQueries({
            queryKey: ['tickets'],
            exact: false,
          })
          // Invalidate specific ticket query if we have the ID
          if (event.ticket_id) {
            queryClient.invalidateQueries({
              queryKey: ['tickets', event.ticket_id],
            })
          }
          break

        case EVENT_TYPES.COMMENT_ADDED:
        case EVENT_TYPES.COMMENT_EDITED:
          // Invalidate comments for the ticket
          if (event.ticket_id) {
            queryClient.invalidateQueries({
              queryKey: ['comments', event.ticket_id],
              exact: false,
            })
          }
          break

        case EVENT_TYPES.LABEL_ADDED:
        case EVENT_TYPES.LABEL_REMOVED:
          // Invalidate ticket labels
          if (event.ticket_id) {
            queryClient.invalidateQueries({
              queryKey: ['ticketLabels', event.ticket_id],
            })
            // Also refresh the ticket itself since labels might be shown inline
            queryClient.invalidateQueries({
              queryKey: ['tickets', event.ticket_id],
            })
          }
          break

        case EVENT_TYPES.MENTION_CREATED:
          // Could trigger notifications in the future
          break
      }
    },
    [queryClient]
  )

  // Build topics based on current view
  const topics = useMemo(() => {
    const result: string[] = []
    if (ticketId) {
      result.push(`ticket:${ticketId}`)
    }
    if (projectId) {
      result.push(`project:${projectId}`)
    }
    return result
  }, [projectId, ticketId])

  const { isConnected } = useWebSocket({
    topics,
    onEvent: handleEvent,
  })

  return { isConnected }
}
