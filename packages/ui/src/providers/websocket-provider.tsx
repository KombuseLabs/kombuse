'use client'

import { useEffect, useRef, useState, useMemo, useCallback, type ReactNode } from 'react'
import type { ClientMessage, ServerMessage } from '@kombuse/types'
import { WebSocketCtx, type MessageHandler } from './websocket-context'

interface WebSocketProviderProps {
  children: ReactNode
  /** WebSocket server URL */
  url: string
  /** Time between reconnection attempts in ms (default: 3000) */
  reconnectInterval?: number
  /** Maximum number of reconnection attempts (default: 10) */
  maxReconnectAttempts?: number
}

/**
 * Provides a shared WebSocket connection to the component tree.
 *
 * Only creates ONE connection regardless of how many components
 * subscribe to messages. Handles automatic reconnection with backoff.
 */
export function WebSocketProvider({
  children,
  url,
  reconnectInterval = 3000,
  maxReconnectAttempts = 10,
}: WebSocketProviderProps) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttempts = useRef(0)
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [isConnected, setIsConnected] = useState(false)

  // Message handlers and topic subscriptions stored in refs (not state)
  const messageHandlers = useRef(new Set<MessageHandler>())
  const subscribedTopics = useRef(new Map<string, number>()) // topic -> ref count

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  // Connect to WebSocket
  useEffect(() => {
    function connect() {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
        reconnectAttempts.current = 0

        // Resubscribe to all topics
        const topics = Array.from(subscribedTopics.current.keys())
        if (topics.length > 0) {
          ws.send(JSON.stringify({ type: 'subscribe', topics } satisfies ClientMessage))
        }
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage
          messageHandlers.current.forEach((handler) => handler(message))
        } catch {
          // Ignore parse errors
        }
      }

      ws.onclose = () => {
        setIsConnected(false)
        wsRef.current = null

        // Attempt reconnection with jitter
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
      wsRef.current = null
    }
  }, [url, reconnectInterval, maxReconnectAttempts])

  const subscribe = useCallback(
    (topics: string[]) => {
      const newTopics: string[] = []

      for (const topic of topics) {
        const count = subscribedTopics.current.get(topic) ?? 0
        subscribedTopics.current.set(topic, count + 1)
        if (count === 0) {
          newTopics.push(topic)
        }
      }

      if (newTopics.length > 0) {
        send({ type: 'subscribe', topics: newTopics })
      }
    },
    [send]
  )

  const unsubscribe = useCallback(
    (topics: string[]) => {
      const removedTopics: string[] = []

      for (const topic of topics) {
        const count = subscribedTopics.current.get(topic) ?? 0
        if (count <= 1) {
          subscribedTopics.current.delete(topic)
          removedTopics.push(topic)
        } else {
          subscribedTopics.current.set(topic, count - 1)
        }
      }

      if (removedTopics.length > 0) {
        send({ type: 'unsubscribe', topics: removedTopics })
      }
    },
    [send]
  )

  const addMessageHandler = useCallback((handler: MessageHandler) => {
    messageHandlers.current.add(handler)
  }, [])

  const removeMessageHandler = useCallback((handler: MessageHandler) => {
    messageHandlers.current.delete(handler)
  }, [])

  const value = useMemo(
    () => ({
      isConnected,
      subscribe,
      unsubscribe,
      addMessageHandler,
      removeMessageHandler,
    }),
    [isConnected, subscribe, unsubscribe, addMessageHandler, removeMessageHandler]
  )

  return <WebSocketCtx.Provider value={value}>{children}</WebSocketCtx.Provider>
}
