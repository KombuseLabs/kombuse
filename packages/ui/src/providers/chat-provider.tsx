'use client'

import { useState, useCallback, useMemo, useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type {
  ServerMessage,
  SerializedAgentEvent,
  SerializedAgentMessageEvent,
  SerializedAgentErrorEvent,
  SerializedAgentPermissionRequestEvent,
  Session,
} from '@kombuse/types'
import { useWebSocket } from '../hooks/use-websocket'
import { useSessionEvents } from '../hooks/use-sessions'
import { ChatCtx } from './chat-context'

interface ChatProviderProps {
  children: ReactNode
  /** The agent ID to send messages to (for live mode) */
  agentId?: string
  /** The session ID to load/continue a conversation */
  sessionId?: string | null
  /** Create/resolve a session ID when sending from a draft chat */
  onEnsureSession?: () => Promise<string>
}

/**
 * Provides chat state and actions to the component tree.
 *
 * Two modes of operation:
 * - Live mode (agentId): Start a new conversation.
 * - Session mode (sessionId + agentId): Load history and continue the same conversation.
 */
export function ChatProvider({
  children,
  agentId,
  sessionId,
  onEnsureSession,
}: ChatProviderProps) {
  const queryClient = useQueryClient()
  const [events, setEvents] = useState<SerializedAgentEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [kombuseSessionId, setKombuseSessionId] = useState<string | null>(null)
  const [pendingPermission, setPendingPermission] =
    useState<SerializedAgentPermissionRequestEvent | null>(null)

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

  const refreshSessions = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['sessions'] })
  }, [queryClient])

  const updateSessionStatus = useCallback(
    (sessionId: string, status: Session['status']) => {
      queryClient.setQueriesData({ queryKey: ['sessions'] }, (data) => {
        if (!Array.isArray(data)) {
          return data
        }
        let updated = false
        const next = data.map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return entry
          }
          const session = entry as Session
          if (session.id === sessionId || session.kombuse_session_id === sessionId) {
            updated = true
            return { ...session, status }
          }
          return session
        })
        return updated ? next : data
      })
    },
    [queryClient]
  )

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'agent.started': {
        if (sessionId && message.kombuseSessionId !== sessionId) {
          break
        }
        setKombuseSessionId(message.kombuseSessionId)
        setIsLoading(true)
        updateSessionStatus(message.kombuseSessionId, 'running')
        refreshSessions()
        break
      }

      case 'agent.event': {
        const expectedSessionId = sessionId ?? kombuseSessionId
        if (!expectedSessionId) {
          break
        }
        if (message.kombuseSessionId !== expectedSessionId) {
          break
        }
        const event = message.event
        // Pass events through directly - they already have all required fields
        setEvents((prev) => [...prev, event])
        // Track permission requests for UI response
        if (event.type === 'permission_request') {
          setPendingPermission(event)
        }
        break
      }

      case 'agent.complete':
        if (!sessionId && !kombuseSessionId) {
          break
        }
        if (
          (sessionId && message.kombuseSessionId !== sessionId) ||
          (!sessionId &&
            kombuseSessionId &&
            message.kombuseSessionId !== kombuseSessionId)
        ) {
          break
        }
        setIsLoading(false)
        setPendingPermission(null)
        updateSessionStatus(message.kombuseSessionId, 'completed')
        refreshSessions()
        break

      case 'error':
        setIsLoading(false)
        refreshSessions()
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
  }, [kombuseSessionId, sessionId, refreshSessions, updateSessionStatus])

  const { isConnected, send: wsSend } = useWebSocket({
    topics: [],
    onMessage: handleMessage,
  })

  const send = useCallback(
    async (message: string) => {
      if (isLoading) return
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

      setIsLoading(true)
      let targetSessionId = sessionId ?? kombuseSessionId ?? undefined

      if (!targetSessionId) {
        if (!onEnsureSession) {
          setIsLoading(false)
          const errorEvent: SerializedAgentErrorEvent = {
            type: 'error',
            message: 'Unable to create a chat session',
            backend: 'mock',
            timestamp: Date.now(),
          }
          setEvents((prev) => [...prev, errorEvent])
          return
        }

        try {
          targetSessionId = await onEnsureSession()
          setKombuseSessionId(targetSessionId)
        } catch (error) {
          setIsLoading(false)
          const errorEvent: SerializedAgentErrorEvent = {
            type: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Failed to create a chat session',
            backend: 'mock',
            timestamp: Date.now(),
          }
          setEvents((prev) => [...prev, errorEvent])
          return
        }
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

      // Send to agent
      wsSend({
        type: 'agent.invoke',
        agentId,
        message,
        kombuseSessionId: targetSessionId,
      })
    },
    [
      agentId,
      sessionId,
      kombuseSessionId,
      isConnected,
      isLoading,
      wsSend,
      onEnsureSession,
    ]
  )

  const respondToPermission = useCallback(
    (requestId: string, behavior: 'allow' | 'deny', message?: string) => {
      const targetSessionId = sessionId ?? kombuseSessionId
      if (!targetSessionId || !pendingPermission) return

      wsSend({
        type: 'permission.response',
        kombuseSessionId: targetSessionId,
        requestId,
        behavior,
        updatedInput: behavior === 'allow' ? pendingPermission.input : undefined,
        message: behavior === 'deny' ? (message ?? 'User rejected this action') : undefined,
      })

      setPendingPermission(null)
    },
    [sessionId, kombuseSessionId, pendingPermission, wsSend]
  )

  const reset = useCallback(() => {
    setEvents([])
    setKombuseSessionId(null)
    setPendingPermission(null)
    setIsLoading(false)
  }, [])

  const value = useMemo(
    () => ({
      events,
      isLoading,
      isConnected,
      kombuseSessionId,
      pendingPermission,
      send,
      respondToPermission,
      reset,
    }),
    [events, isLoading, isConnected, kombuseSessionId, pendingPermission, send, respondToPermission, reset]
  )

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>
}
