'use client'

import { useEffect, useRef, useState, useMemo, useCallback, type ReactNode } from 'react'
import type { ClientMessage, ServerMessage } from '@kombuse/types'
import { createBrowserLogger } from '@kombuse/core/browser-logger'
import { WebSocketCtx, type MessageHandler } from './websocket-context'

const logger = createBrowserLogger('WebSocket')

interface WebSocketProviderProps {
  children: ReactNode
  /** WebSocket server URL */
  url: string
  /** Time between reconnection attempts in ms (default: 3000) */
  reconnectInterval?: number
  /** Maximum number of reconnection attempts (default: Infinity) */
  maxReconnectAttempts?: number
}

/**
 * Simple topic subscription manager that's immune to React Strict Mode.
 *
 * Instead of ref-counting individual subscribe/unsubscribe calls (which break
 * under Strict Mode's double-mount), we use a registration model:
 * - Each hook instance registers its desired topics with a unique ID
 * - The manager computes the union of all registered topics
 * - Reconciles actual subscriptions when registrations change or connection opens
 */
function createTopicManager(
  sendSubscribe: (topics: string[]) => void,
  sendUnsubscribe: (topics: string[]) => void
) {
  // Map of hookId -> Set of topics that hook wants
  const registrations = new Map<string, Set<string>>()
  // Currently subscribed topics on the server
  let activeTopics = new Set<string>()
  let reconcileTimer: ReturnType<typeof setTimeout> | undefined

  function getDesiredTopics(): Set<string> {
    const all = new Set<string>()
    for (const topics of registrations.values()) {
      for (const t of topics) all.add(t)
    }
    return all
  }

  function reconcile() {
    if (reconcileTimer) {
      clearTimeout(reconcileTimer)
      reconcileTimer = undefined
    }
    const desired = getDesiredTopics()
    const toAdd = [...desired].filter((t) => !activeTopics.has(t))
    const toRemove = [...activeTopics].filter((t) => !desired.has(t))

    if (toAdd.length > 0) {
      sendSubscribe(toAdd)
    }
    if (toRemove.length > 0) {
      sendUnsubscribe(toRemove)
    }
    activeTopics = desired
  }

  function scheduleReconcile(delayMs: number) {
    if (reconcileTimer) {
      clearTimeout(reconcileTimer)
    }
    reconcileTimer = setTimeout(reconcile, delayMs)
  }

  return {
    register(hookId: string, topics: string[]) {
      registrations.set(hookId, new Set(topics))
      reconcile()
    },
    unregister(hookId: string) {
      registrations.delete(hookId)
      // Debounce unregister to avoid Strict Mode unmount/remount churn
      scheduleReconcile(50)
    },
    onConnect() {
      // Reset active topics and resubscribe to everything
      activeTopics = new Set()
      const desired = getDesiredTopics()
      if (desired.size > 0) {
        logger.info(`connected, subscribing to: ${[...desired].join(', ')}`)
      }
      reconcile()
    },
    getDesiredTopics,
    dispose() {
      if (reconcileTimer) {
        clearTimeout(reconcileTimer)
        reconcileTimer = undefined
      }
    },
  }
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
  maxReconnectAttempts = Infinity,
}: WebSocketProviderProps) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttempts = useRef(0)
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const shouldReconnectRef = useRef(true)
  const [isConnected, setIsConnected] = useState(false)

  // Message handlers stored in ref
  const messageHandlers = useRef(new Set<MessageHandler>())

  // Topic manager - stable across renders
  const topicManagerRef = useRef<ReturnType<typeof createTopicManager> | null>(null)
  if (!topicManagerRef.current) {
    topicManagerRef.current = createTopicManager(
      (topics) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'subscribe', topics } satisfies ClientMessage))
        }
      },
      (topics) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'unsubscribe', topics } satisfies ClientMessage))
        }
      }
    )
  }
  const topicManager = topicManagerRef.current

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  // Connect to WebSocket
  useEffect(() => {
    let isActive = true
    shouldReconnectRef.current = true

    const safeSetConnected = (connected: boolean) => {
      if (isActive) {
        setIsConnected(connected)
      }
    }

    function connect() {
      if (!isActive) return
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!isActive || wsRef.current !== ws) return
        safeSetConnected(true)
        reconnectAttempts.current = 0
        topicManager.onConnect()
      }

      ws.onmessage = (event) => {
        if (!isActive || wsRef.current !== ws) return
        try {
          const message = JSON.parse(event.data) as ServerMessage
          messageHandlers.current.forEach((handler) => {
            try {
              handler(message)
            } catch (err) {
              logger.error('handler error', { error: err instanceof Error ? err.message : String(err) })
            }
          })
        } catch (err) {
          logger.error('parse error', { error: err instanceof Error ? err.message : String(err) })
        }
      }

      ws.onclose = () => {
        if (!isActive || wsRef.current !== ws) return
        safeSetConnected(false)
        wsRef.current = null

        // Attempt reconnection with exponential backoff
        if (shouldReconnectRef.current && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++
          const exponentialDelay = Math.min(
            reconnectInterval * Math.pow(2, reconnectAttempts.current - 1),
            60_000
          )
          const jitter = Math.random() * 1000
          reconnectTimeout.current = setTimeout(connect, exponentialDelay + jitter)
        }
      }

      ws.onerror = () => {
        if (!isActive || wsRef.current !== ws) return
        ws.close()
      }
    }

    connect()

    return () => {
      safeSetConnected(false)
      isActive = false
      shouldReconnectRef.current = false
      clearTimeout(reconnectTimeout.current)
      reconnectTimeout.current = undefined
      topicManager.dispose()
      const ws = wsRef.current
      wsRef.current = null
      ws?.close()
    }
  }, [url, reconnectInterval, maxReconnectAttempts, topicManager])

  const registerTopics = useCallback(
    (hookId: string, topics: string[]) => {
      topicManager.register(hookId, topics)
    },
    [topicManager]
  )

  const unregisterTopics = useCallback(
    (hookId: string) => {
      topicManager.unregister(hookId)
    },
    [topicManager]
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
      send,
      registerTopics,
      unregisterTopics,
      addMessageHandler,
      removeMessageHandler,
    }),
    [isConnected, send, registerTopics, unregisterTopics, addMessageHandler, removeMessageHandler]
  )

  return <WebSocketCtx.Provider value={value}>{children}</WebSocketCtx.Provider>
}
