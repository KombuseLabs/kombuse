'use client'

import { useState, useCallback, useMemo, type ReactNode } from 'react'
import type { ServerMessage, SerializedAgentEvent, SerializedAgentMessageEvent, SerializedAgentErrorEvent } from '@kombuse/types'
import { useWebSocket } from '../hooks/use-websocket'
import { ChatCtx } from './chat-context'

interface ChatProviderProps {
  children: ReactNode
  /** The agent ID to send messages to */
  agentId: string
}

/**
 * Provides chat state and actions to the component tree.
 * Handles WebSocket message parsing and state management.
 */
export function ChatProvider({ children, agentId }: ChatProviderProps) {
  const [events, setEvents] = useState<SerializedAgentEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [kombuseSessionId, setKombuseSessionId] = useState<string | null>(null)

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'agent.started':
        setKombuseSessionId(message.kombuseSessionId)
        setIsLoading(true)
        break

      case 'agent.event': {
        const event = message.event
        // Pass events through directly - they already have all required fields
        setEvents((prev) => [...prev, event])
        break
      }

      case 'agent.complete':
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
  }, [])

  const { isConnected, send: wsSend } = useWebSocket({
    topics: [],
    onMessage: handleMessage,
  })

  const send = useCallback(
    (message: string) => {
      if (isLoading) return

      // Add user message as a proper event
      const userEvent: SerializedAgentMessageEvent = {
        type: 'message',
        role: 'user',
        content: message,
        backend: 'mock',
        timestamp: Date.now(),
      }
      setEvents((prev) => [...prev, userEvent])

      // Send to agent
      wsSend({
        type: 'agent.invoke',
        agentId,
        message,
        kombuseSessionId: kombuseSessionId ?? undefined,
      })
    },
    [agentId, kombuseSessionId, isLoading, wsSend]
  )

  const reset = useCallback(() => {
    setEvents([])
    setKombuseSessionId(null)
    setIsLoading(false)
  }, [])

  const value = useMemo(
    () => ({
      events,
      isLoading,
      isConnected,
      kombuseSessionId,
      send,
      reset,
    }),
    [events, isLoading, isConnected, kombuseSessionId, send, reset]
  )

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>
}
