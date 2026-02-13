'use client'

import { useState, useCallback, useMemo, useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type {
  ServerMessage,
  SerializedAgentEvent,
  SerializedAgentMessageEvent,
  SerializedAgentErrorEvent,
  SerializedAgentPermissionRequestEvent,
  PublicSession,
  PendingPermission,
  JsonObject,
  BackendType,
} from '@kombuse/types'
import { useWebSocket } from '../hooks/use-websocket'
import { useSessionByKombuseId, useSessionEvents } from '../hooks/use-sessions'
import { useAppContext } from '../hooks/use-app-context'
import { ChatCtx } from './chat-context'

interface ChatProviderProps {
  children: ReactNode
  /** The agent ID to send messages to (for live mode) */
  agentId?: string
  /** The session ID to load/continue a conversation */
  sessionId?: string | null
  /** Optional project context for resolving workspace paths */
  projectId?: string | null
  /** Optional explicit backend type for new turns */
  backendType?: BackendType
  /** Optional per-session model preference for first invocation. */
  modelPreference?: string
  /** Create/resolve a session ID when sending from a draft chat */
  onEnsureSession?: () => Promise<string>
}

/** Convert a global PendingPermission into a SerializedAgentPermissionRequestEvent for ChatProvider */
function pendingPermissionToEvent(perm: PendingPermission): SerializedAgentPermissionRequestEvent {
  return {
    type: 'permission_request',
    eventId: `restored-${perm.requestId}`,
    backend: 'claude-code',
    timestamp: Date.now(),
    requestId: perm.requestId,
    toolName: perm.toolName,
    toolUseId: `restored-${perm.requestId}`,
    input: perm.input as JsonObject,
    description: perm.description,
    autoApproved: false,
  }
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
  projectId,
  backendType,
  modelPreference,
  onEnsureSession,
}: ChatProviderProps) {
  const queryClient = useQueryClient()
  const [events, setEvents] = useState<SerializedAgentEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [kombuseSessionId, setKombuseSessionId] = useState<string | null>(null)
  const [pendingPermission, setPendingPermission] =
    useState<SerializedAgentPermissionRequestEvent | null>(null)

  const { pendingPermissions } = useAppContext()

  // Fetch session metadata — URL now contains kombuse_session_id
  const { data: sessionData } = useSessionByKombuseId(sessionId ?? null)

  // Historical mode: fetch session events by kombuse session ID
  const { data: sessionEventsData } = useSessionEvents(sessionData?.kombuse_session_id ?? null)

  // The effective kombuse session ID — either from the loaded session record,
  // or from state set when the user started a new session
  const effectiveKombuseSessionId = sessionData?.kombuse_session_id ?? kombuseSessionId

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

  // Sync isLoading from persisted session status on load
  useEffect(() => {
    if (sessionData?.status === 'running') {
      setIsLoading(true)
    } else if (sessionData?.status) {
      setIsLoading(false)
    }
  }, [sessionData?.status])

  // Restore pendingPermission from AppProvider's global map when loading a session.
  // This enables the interactive AskUserBar/PlanApprovalBar to render when navigating
  // to a chat with a pending permission (e.g. via the notification bell).
  const globalPermForSession = useMemo(() => {
    if (!effectiveKombuseSessionId) return undefined
    return [...pendingPermissions.values()].find(
      (p) => p.sessionId === effectiveKombuseSessionId
    )
  }, [pendingPermissions, effectiveKombuseSessionId])

  useEffect(() => {
    if (pendingPermission) return
    if (globalPermForSession) {
      setPendingPermission(pendingPermissionToEvent(globalPermForSession))
    }
  }, [globalPermForSession, pendingPermission])

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
    (sessionId: string, status: PublicSession['status']) => {
      queryClient.setQueriesData({ queryKey: ['sessions'] }, (data) => {
        if (!Array.isArray(data)) {
          return data
        }
        let updated = false
        const next = data.map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return entry
          }
          const session = entry as PublicSession
          if (session.kombuse_session_id === sessionId) {
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
        if (effectiveKombuseSessionId && message.kombuseSessionId !== effectiveKombuseSessionId) {
          break
        }
        setKombuseSessionId(message.kombuseSessionId)
        setIsLoading(true)
        updateSessionStatus(message.kombuseSessionId, 'running')
        refreshSessions()
        break
      }

      case 'agent.event': {
        if (!effectiveKombuseSessionId) {
          break
        }
        if (message.kombuseSessionId !== effectiveKombuseSessionId) {
          break
        }
        const event = message.event
        // Pass events through directly - they already have all required fields
        setEvents((prev) => [...prev, event])
        // Track permission requests for UI response (skip auto-approved)
        if (event.type === 'permission_request' && !event.autoApproved) {
          setPendingPermission(event)
        }
        break
      }

      case 'agent.permission_resolved': {
        if (effectiveKombuseSessionId && message.sessionId === effectiveKombuseSessionId) {
          setPendingPermission(null)
        }
        break
      }

      case 'agent.complete': {
        if (!effectiveKombuseSessionId) {
          break
        }
        if (message.kombuseSessionId !== effectiveKombuseSessionId) {
          break
        }
        setIsLoading(false)
        setPendingPermission(null)
        updateSessionStatus(message.kombuseSessionId, 'completed')
        refreshSessions()
        break
      }

      case 'error': {
        setIsLoading(false)
        refreshSessions()
        // Create an error event for server-level errors
        const errorEvent: SerializedAgentErrorEvent = {
          type: 'error',
          eventId: crypto.randomUUID(),
          message: message.message,
          backend: 'mock',
          timestamp: Date.now(),
        }
        setEvents((prev) => [...prev, errorEvent])
        break
      }
    }
  }, [effectiveKombuseSessionId, refreshSessions, updateSessionStatus])

  const sessionTopics = useMemo(() => {
    if (effectiveKombuseSessionId) {
      return [`session:${effectiveKombuseSessionId}`]
    }
    return []
  }, [effectiveKombuseSessionId])

  const { isConnected, send: wsSend } = useWebSocket({
    topics: sessionTopics,
    onMessage: handleMessage,
  })

  const send = useCallback(
    async (message: string) => {
      if (isLoading) return
      if (!isConnected) {
        const errorEvent: SerializedAgentErrorEvent = {
          type: 'error',
          eventId: crypto.randomUUID(),
          message: 'WebSocket is not connected',
          backend: 'mock',
          timestamp: Date.now(),
        }
        setEvents((prev) => [...prev, errorEvent])
        return
      }

      setIsLoading(true)
      let targetSessionId = effectiveKombuseSessionId ?? undefined

      if (!targetSessionId) {
        if (!onEnsureSession) {
          setIsLoading(false)
          const errorEvent: SerializedAgentErrorEvent = {
            type: 'error',
            eventId: crypto.randomUUID(),
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
            eventId: crypto.randomUUID(),
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
        eventId: crypto.randomUUID(),
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
        projectId: projectId ?? undefined,
        backendType,
        modelPreference:
          typeof modelPreference === 'string' && modelPreference.trim().length > 0
            ? modelPreference.trim()
            : undefined,
      })
    },
    [
      agentId,
      effectiveKombuseSessionId,
      projectId,
      backendType,
      modelPreference,
      isConnected,
      isLoading,
      wsSend,
      onEnsureSession,
    ]
  )

  const respondToPermission = useCallback(
    (requestId: string, behavior: 'allow' | 'deny', message?: string, updatedInput?: Record<string, unknown>) => {
      if (!effectiveKombuseSessionId || !pendingPermission) return

      wsSend({
        type: 'permission.response',
        kombuseSessionId: effectiveKombuseSessionId,
        requestId,
        behavior,
        updatedInput: behavior === 'allow' ? (updatedInput ?? pendingPermission.input) : undefined,
        message: behavior === 'deny' ? (message ?? 'User rejected this action') : undefined,
      })

      setPendingPermission(null)
    },
    [effectiveKombuseSessionId, pendingPermission, wsSend]
  )

  const reset = useCallback(() => {
    setEvents([])
    setKombuseSessionId(null)
    setPendingPermission(null)
    setIsLoading(false)
  }, [])

  const backendSessionId = sessionData?.backend_session_id ?? null

  const value = useMemo(
    () => ({
      events,
      isLoading,
      isConnected,
      kombuseSessionId: effectiveKombuseSessionId,
      backendSessionId,
      pendingPermission,
      send,
      respondToPermission,
      reset,
    }),
    [events, isLoading, isConnected, effectiveKombuseSessionId, backendSessionId, pendingPermission, send, respondToPermission, reset]
  )

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>
}
