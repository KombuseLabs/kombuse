import { useEffect, useRef, useCallback, useContext } from 'react'
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
  subscribe: (topics: string[]) => void
  unsubscribe: (topics: string[]) => void
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

  const { isConnected, send, subscribe, unsubscribe, addMessageHandler, removeMessageHandler } = ctx

  // Store latest topics in a ref to track changes
  const topicsRef = useRef<string[]>([])

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

  // Handle topic subscriptions
  useEffect(() => {
    const prevTopics = topicsRef.current
    const newTopics = topics

    // Find topics to add and remove
    const toAdd = newTopics.filter((t) => !prevTopics.includes(t))
    const toRemove = prevTopics.filter((t) => !newTopics.includes(t))

    if (toAdd.length > 0) {
      subscribe(toAdd)
    }
    if (toRemove.length > 0) {
      unsubscribe(toRemove)
    }

    topicsRef.current = [...newTopics]

    // Cleanup: unsubscribe from all topics when unmounting
    return () => {
      if (newTopics.length > 0) {
        unsubscribe(newTopics)
      }
    }
  }, [topics.join(','), subscribe, unsubscribe])

  return { isConnected, send, subscribe, unsubscribe }
}
