import { useEffect, useRef, useCallback, useContext, useId } from 'react'
import type { ClientMessage, ServerMessage } from '@kombuse/types'
import { WebSocketCtx } from '../providers/websocket-context'

interface UseWebSocketOptions {
  topics: string[]
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
 * @param options.onMessage - Callback for all server messages
 */
export function useWebSocket({
  topics,
  onMessage,
}: UseWebSocketOptions): UseWebSocketReturn {
  const ctx = useContext(WebSocketCtx)

  if (!ctx) {
    throw new Error('useWebSocket must be used within a WebSocketProvider')
  }

  const { isConnected, send, registerTopics, unregisterTopics, addMessageHandler, removeMessageHandler } = ctx

  // Stable hook ID for registration
  const hookId = useId()

  // Store latest callback in ref to avoid stale closures
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  // Message handler for this hook instance
  const handleMessage = useCallback((message: ServerMessage) => {
    if (onMessageRef.current) {
      onMessageRef.current(message)
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
