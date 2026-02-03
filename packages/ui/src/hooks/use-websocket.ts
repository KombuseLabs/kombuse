import { useEffect, useRef, useCallback, useState } from 'react'
import type { ClientMessage, ServerMessage, WebSocketEvent } from '@kombuse/types'

interface UseWebSocketOptions {
  url: string
  topics: string[]
  onEvent?: (event: WebSocketEvent) => void
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

interface UseWebSocketReturn {
  isConnected: boolean
  subscribe: (topics: string[]) => void
  unsubscribe: (topics: string[]) => void
}

/**
 * Low-level WebSocket hook with auto-reconnect and topic subscription.
 *
 * @param options.url - WebSocket server URL
 * @param options.topics - Initial topics to subscribe to
 * @param options.onEvent - Callback when events are received
 * @param options.reconnectInterval - Time between reconnection attempts (default: 3000ms)
 * @param options.maxReconnectAttempts - Max reconnection attempts (default: 10)
 */
export function useWebSocket({
  url,
  topics,
  onEvent,
  reconnectInterval = 3000,
  maxReconnectAttempts = 10,
}: UseWebSocketOptions): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttempts = useRef(0)
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [isConnected, setIsConnected] = useState(false)

  // Store latest topics in a ref to avoid stale closures
  const topicsRef = useRef(topics)
  topicsRef.current = topics

  // Store latest onEvent in a ref to avoid stale closures
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  const subscribe = useCallback(
    (newTopics: string[]) => {
      send({ type: 'subscribe', topics: newTopics })
    },
    [send]
  )

  const unsubscribe = useCallback(
    (oldTopics: string[]) => {
      send({ type: 'unsubscribe', topics: oldTopics })
    },
    [send]
  )

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
        reconnectAttempts.current = 0

        // Subscribe to initial topics
        if (topicsRef.current.length > 0) {
          ws.send(
            JSON.stringify({
              type: 'subscribe',
              topics: topicsRef.current,
            } satisfies ClientMessage)
          )
        }
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage
          if (message.type === 'event' && onEventRef.current) {
            onEventRef.current(message.event)
          }
        } catch {
          // Ignore parse errors
        }
      }

      ws.onclose = () => {
        setIsConnected(false)
        wsRef.current = null

        // Attempt reconnection with exponential backoff jitter
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++
          const jitter = Math.random() * 1000
          const delay = reconnectInterval + jitter
          reconnectTimeout.current = setTimeout(connect, delay)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimeout.current)
      wsRef.current?.close()
    }
  }, [url, reconnectInterval, maxReconnectAttempts])

  // Handle topic changes while connected
  useEffect(() => {
    if (isConnected && topics.length > 0) {
      subscribe(topics)
    }
  }, [topics.join(','), isConnected, subscribe])

  return { isConnected, subscribe, unsubscribe }
}
