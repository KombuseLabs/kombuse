import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { WebSocketEvent, EventType, ServerMessage } from '@kombuse/types'
import { EVENT_TYPES } from '@kombuse/types'
import { useWebSocket } from './use-websocket'
import { ticketKeys, commentKeys, ticketTimelineKeys, labelKeys } from '../lib/query-keys'

interface UseRealtimeUpdatesOptions {
  projectId?: string
  ticketNumber?: number
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
 * @param options.ticketNumber - Subscribe to all events for this ticket
 *
 * @example
 * // In a ticket list view
 * const { isConnected } = useRealtimeUpdates({ projectId: 'proj-1' })
 *
 * @example
 * // In a ticket detail view
 * const { isConnected } = useRealtimeUpdates({ projectId: 'proj-1', ticketNumber: 123 })
 */
export function useRealtimeUpdates({
  projectId,
  ticketNumber,
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
            queryKey: ticketKeys.all,
            exact: false,
          })
          // Invalidate specific ticket query and its timeline
          if (event.project_id && event.ticket_number) {
            queryClient.invalidateQueries({
              queryKey: ticketKeys.byNumber(event.project_id, event.ticket_number),
            })
            queryClient.invalidateQueries({
              queryKey: ticketTimelineKeys.detail(event.project_id, event.ticket_number),
            })
          }
          break

        case EVENT_TYPES.COMMENT_ADDED:
        case EVENT_TYPES.COMMENT_EDITED:
        case EVENT_TYPES.COMMENT_DELETED:
          // Invalidate comments and timeline for the ticket
          if (event.project_id && event.ticket_number) {
            queryClient.invalidateQueries({
              queryKey: commentKeys.list(event.project_id, event.ticket_number),
              exact: false,
            })
            queryClient.invalidateQueries({
              queryKey: ticketTimelineKeys.detail(event.project_id, event.ticket_number),
            })
          }
          break

        case EVENT_TYPES.LABEL_ADDED:
        case EVENT_TYPES.LABEL_REMOVED:
          // Invalidate ticket labels
          if (event.project_id && event.ticket_number) {
            queryClient.invalidateQueries({
              queryKey: labelKeys.ticket(event.project_id, event.ticket_number),
            })
            // Invalidate ticket list queries (with any filters) so label badges refresh
            queryClient.invalidateQueries({
              queryKey: ticketKeys.all,
              exact: false,
            })
            // Also refresh the ticket itself and timeline since labels might be shown inline
            queryClient.invalidateQueries({
              queryKey: ticketKeys.byNumber(event.project_id, event.ticket_number),
            })
            queryClient.invalidateQueries({
              queryKey: ticketTimelineKeys.detail(event.project_id, event.ticket_number),
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
    if (projectId && ticketNumber) {
      result.push(`ticket:${projectId}:${ticketNumber}`)
    }
    if (projectId) {
      result.push(`project:${projectId}`)
    }
    return result
  }, [projectId, ticketNumber])

  const handleMessage = useCallback(
    (message: ServerMessage) => {
      if (message.type === 'event') {
        handleEvent(message.event)
      }
    },
    [handleEvent]
  )

  const { isConnected } = useWebSocket({
    topics,
    onMessage: handleMessage,
  })

  // Invalidate stale caches on WebSocket reconnect
  const wasConnectedRef = useRef(isConnected)
  useEffect(() => {
    const wasConnected = wasConnectedRef.current
    wasConnectedRef.current = isConnected

    if (!wasConnected && isConnected) {
      queryClient.invalidateQueries({ queryKey: ticketKeys.all, exact: false })
      queryClient.invalidateQueries({ queryKey: commentKeys.all, exact: false })
      queryClient.invalidateQueries({
        queryKey: ticketTimelineKeys.all,
        exact: false,
      })
      queryClient.invalidateQueries({ queryKey: labelKeys.all, exact: false })
    }
  }, [isConnected, queryClient])

  return { isConnected }
}
