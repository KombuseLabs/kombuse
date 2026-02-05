import { useEffect, useRef, useCallback, useContext, useId } from 'react'
import type { ClientMessage, ServerMessage, WebSocketEvent } from '@kombuse/types'
import { WebSocketCtx } from '../providers/websocket-context'

interface UseWebSocketOptions {
  topics: string[]
  onEvent?: (event: WebSocketEvent) => void
  /** Callback for all server messages (more flexible than onEvent) */
  onMessage?: (message: ServerMessage) => void
}

interface UseWebSocketReturn {
  isConnected: boolean
  send: (message: ClientMessage) => void
}

/**
 * WebSocket hook that uses the shared context connection.
 *
 * Requires WebSocketProvider to be in the component tree.
 *
 * @param options.topics - Topics to subscribe to
 * @param options.onEvent - Callback when events are received
 * @param options.onMessage - Callback for all server messages
 */
export function useWebSocket({
  topics,
  onEvent,
  onMessage,
}: UseWebSocketOptions): UseWebSocketReturn {
  const ctx = useContext(WebSocketCtx)

  if (!ctx) {
    throw new Error('useWebSocket must be used within a WebSocketProvider')
  }

  const { isConnected, send, registerTopics, unregisterTopics, addMessageHandler, removeMessageHandler } = ctx

  // Stable hook ID for registration
  const hookId = useId()

  // Store latest callbacks in refs to avoid stale closures
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  // Message handler for this hook instance
  const handleMessage = useCallback((message: ServerMessage) => {
    // Call generic message handler
    if (onMessageRef.current) {
      onMessageRef.current(message)
    }
    // Call event-specific handler for backwards compatibility
    if (message.type === 'event' && onEventRef.current) {
      onEventRef.current(message.event)
    }
  }, [])

  // Register message handler
  useEffect(() => {
    addMessageHandler(handleMessage)
    return () => {
      removeMessageHandler(handleMessage)
    }
  }, [addMessageHandler, removeMessageHandler, handleMessage])

  // Memoize topics key for stable dependency
  const topicsKey = JSON.stringify(topics)

  // Register topics - immune to Strict Mode because:
  // 1. Registration is idempotent (same hookId overwrites)
  // 2. Unregister on cleanup doesn't immediately unsubscribe (debounced)
  // 3. On connect, we subscribe to all registered topics
  useEffect(() => {
    registerTopics(hookId, topics)
    return () => {
      unregisterTopics(hookId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hookId, topicsKey, registerTopics, unregisterTopics])

  return { isConnected, send }
}
