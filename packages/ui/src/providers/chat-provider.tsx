'use client'

import { useState, useCallback, useMemo, useEffect, type ReactNode } from 'react'
import type { ServerMessage, SerializedAgentEvent, SerializedAgentMessageEvent, SerializedAgentErrorEvent } from '@kombuse/types'
import { useWebSocket } from '../hooks/use-websocket'
import { useSessionEvents } from '../hooks/use-sessions'
import { ChatCtx } from './chat-context'

interface ChatProviderProps {
  children: ReactNode
  /** The agent ID to send messages to (for live mode) */
  agentId?: string
  /** The session ID to load historical events from (for read-only mode) */
  sessionId?: string | null
}

/**
 * Provides chat state and actions to the component tree.
 *
 * Two modes of operation:
 * - Live mode (agentId): Handles WebSocket message parsing and state management for new conversations
 * - Historical mode (sessionId): Loads and displays events from a saved session (read-only)
 */
export function ChatProvider({ children, agentId, sessionId }: ChatProviderProps) {
  const [events, setEvents] = useState<SerializedAgentEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [kombuseSessionId, setKombuseSessionId] = useState<string | null>(null)

  // Historical mode: fetch session events
  const { data: sessionEventsData } = useSessionEvents(sessionId ?? null)

  // Load historical events when sessionId is provided
  useEffect(() => {
    if (sessionId && sessionEventsData?.events) {
      // Convert SessionEvent payloads to SerializedAgentEvent
      const historicalEvents = sessionEventsData.events.map(
        (e) => e.payload as SerializedAgentEvent
      )
      setEvents(historicalEvents)
    }
  }, [sessionId, sessionEventsData])

  // Reset events when switching modes
  useEffect(() => {
    if (agentId && !sessionId) {
      setEvents([])
      setKombuseSessionId(null)
      setIsLoading(false)
    }
  }, [agentId, sessionId])

  const handleMessage = useCallback((message: ServerMessage) => {
    // Ignore WebSocket messages in historical mode
    if (sessionId) return

    switch (message.type) {
      case 'agent.started':
        setKombuseSessionId(message.kombuseSessionId)
        setIsLoading(true)
        break

      case 'agent.event': {
        // Ignore events from other sessions to avoid cross-talk in shared sockets.
        if (kombuseSessionId && message.kombuseSessionId !== kombuseSessionId) {
          break
        }
        const event = message.event
        // Pass events through directly - they already have all required fields
        setEvents((prev) => [...prev, event])
        break
      }

      case 'agent.complete':
        if (kombuseSessionId && message.kombuseSessionId !== kombuseSessionId) {
          break
        }
        setIsLoading(false)
        break

      case 'error':
        setIsLoading(false)
        // Create an error event for server-level errors
        const errorEvent: SerializedAgentErrorEvent = {
          type: 'error',
          message: message.message,
          backend: 'mock',
          timestamp: Date.now(),
        }
        setEvents((prev) => [...prev, errorEvent])
        break
    }
  }, [kombuseSessionId, sessionId])

  const { isConnected, send: wsSend } = useWebSocket({
    topics: [],
    onMessage: handleMessage,
  })

  const send = useCallback(
    (message: string) => {
      // Disable sending in historical mode
      if (sessionId) return
      if (isLoading) return
      if (!agentId) return
      if (!isConnected) {
        const errorEvent: SerializedAgentErrorEvent = {
          type: 'error',
          message: 'WebSocket is not connected',
          backend: 'mock',
          timestamp: Date.now(),
        }
        setEvents((prev) => [...prev, errorEvent])
        return
      }

      // Add user message as a proper event
      const userEvent: SerializedAgentMessageEvent = {
        type: 'message',
        role: 'user',
        content: message,
        backend: 'mock',
        timestamp: Date.now(),
      }
      setEvents((prev) => [...prev, userEvent])
      setIsLoading(true)

      // Send to agent
      wsSend({
        type: 'agent.invoke',
        agentId,
        message,
        kombuseSessionId: kombuseSessionId ?? undefined,
      })
    },
    [agentId, sessionId, kombuseSessionId, isConnected, isLoading, wsSend]
  )

  const reset = useCallback(() => {
    setEvents([])
    setKombuseSessionId(null)
    setIsLoading(false)
  }, [])

  // In historical mode, we're never loading (data is already loaded) and sending is disabled
  const isHistoricalMode = Boolean(sessionId)

  const value = useMemo(
    () => ({
      events,
      isLoading: isHistoricalMode ? false : isLoading,
      isConnected: isHistoricalMode ? true : isConnected,
      kombuseSessionId,
      send,
      reset,
    }),
    [events, isLoading, isConnected, kombuseSessionId, send, reset, isHistoricalMode]
  )

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>
}
