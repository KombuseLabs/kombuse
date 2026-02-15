'use client'

import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react'
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

const INITIAL_SESSION_EVENTS_LIMIT = 1000

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

function formatTerminalReason(reason: string | null | undefined): string | null {
  if (!reason || reason.trim().length === 0) {
    return null
  }
  return reason
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function mergeEventsById(
  currentEvents: SerializedAgentEvent[],
  incomingEvents: SerializedAgentEvent[],
  eventSequenceById: Map<string, number>
): SerializedAgentEvent[] {
  const mergedByEventId = new Map(
    currentEvents.map((event) => [event.eventId, event] as const)
  )
  const fallbackOrderById = new Map(
    currentEvents.map((event, index) => [event.eventId, index] as const)
  )
  let nextFallbackOrder = currentEvents.length

  for (const incomingEvent of incomingEvents) {
    if (!fallbackOrderById.has(incomingEvent.eventId)) {
      fallbackOrderById.set(incomingEvent.eventId, nextFallbackOrder)
      nextFallbackOrder += 1
    }
    mergedByEventId.set(incomingEvent.eventId, incomingEvent)
  }

  return [...mergedByEventId.values()].sort((a, b) => {
    const aSequence = eventSequenceById.get(a.eventId)
    const bSequence = eventSequenceById.get(b.eventId)
    if (aSequence !== undefined && bSequence !== undefined && aSequence !== bSequence) {
      return aSequence - bSequence
    }

    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp
    }

    const aFallbackOrder = fallbackOrderById.get(a.eventId) ?? Number.MAX_SAFE_INTEGER
    const bFallbackOrder = fallbackOrderById.get(b.eventId) ?? Number.MAX_SAFE_INTEGER
    return aFallbackOrder - bFallbackOrder
  })
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
  const [sessionStatus, setSessionStatus] = useState<PublicSession['status'] | null>(null)
  const [terminalReason, setTerminalReason] = useState<string | null>(null)
  const [terminalMessage, setTerminalMessage] = useState<string | null>(null)
  const [historyLoadedCount, setHistoryLoadedCount] = useState<number | null>(null)
  const [historyTotalCount, setHistoryTotalCount] = useState<number | null>(null)
  const [kombuseSessionId, setKombuseSessionId] = useState<string | null>(null)
  const [pendingPermission, setPendingPermission] =
    useState<SerializedAgentPermissionRequestEvent | null>(null)
  const previousSessionIdRef = useRef<string | null>(null)
  const eventSequenceByIdRef = useRef<Map<string, number>>(new Map())

  const { pendingPermissions, activeSessions } = useAppContext()

  // Fetch session metadata — URL now contains kombuse_session_id
  const { data: sessionData } = useSessionByKombuseId(sessionId ?? null)

  const sessionEventFilters = useMemo(() => ({
    limit: INITIAL_SESSION_EVENTS_LIMIT,
  }), [])

  // Historical mode: fetch session events by kombuse session ID
  const { data: sessionEventsData } = useSessionEvents(
    sessionData?.kombuse_session_id ?? null,
    sessionEventFilters
  )

  // The effective kombuse session ID — either from the loaded session record,
  // or from state set when the user started a new session
  const effectiveKombuseSessionId = sessionData?.kombuse_session_id ?? kombuseSessionId

  useEffect(() => {
    if (previousSessionIdRef.current !== sessionId) {
      previousSessionIdRef.current = sessionId ?? null
      eventSequenceByIdRef.current = new Map()
      setEvents([])
      setHistoryLoadedCount(null)
      setHistoryTotalCount(null)
    }
  }, [sessionId])

  // Load historical events when sessionId is provided
  useEffect(() => {
    if (sessionId && sessionEventsData?.events) {
      const updatedSequenceMap = new Map(eventSequenceByIdRef.current)

      const historicalEvents = sessionEventsData.events.map((event): SerializedAgentEvent => {
        const payload = event.payload as SerializedAgentEvent
        updatedSequenceMap.set(payload.eventId, event.seq)
        return payload
      })

      eventSequenceByIdRef.current = updatedSequenceMap
      setEvents((currentEvents) => mergeEventsById(
        currentEvents,
        historicalEvents,
        updatedSequenceMap
      ))
      setHistoryLoadedCount(sessionEventsData.events.length)
      setHistoryTotalCount(sessionEventsData.total)
    }
  }, [sessionId, sessionEventsData])

  // Sync isLoading from persisted session status on load
  useEffect(() => {
    if (sessionData?.status === 'running') {
      const isLiveRunningSession =
        typeof sessionData.kombuse_session_id === 'string'
        && activeSessions.has(sessionData.kombuse_session_id)
      setIsLoading(isLiveRunningSession)
      setSessionStatus('running')
      setTerminalReason(null)
      setTerminalMessage(null)
    } else if (sessionData?.status) {
      setIsLoading(false)
      setSessionStatus(sessionData.status)
      const reasonFromMetadata =
        typeof sessionData.metadata?.terminal_reason === 'string'
          ? sessionData.metadata.terminal_reason
          : null
      const errorFromMetadata =
        typeof sessionData.metadata?.terminal_error === 'string'
          ? sessionData.metadata.terminal_error
          : null
      setTerminalReason(reasonFromMetadata)
      setTerminalMessage(errorFromMetadata ?? formatTerminalReason(reasonFromMetadata))
    }
  }, [activeSessions, sessionData])

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
      eventSequenceByIdRef.current = new Map()
      setEvents([])
      setHistoryLoadedCount(null)
      setHistoryTotalCount(null)
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
        setSessionStatus('running')
        setTerminalReason(null)
        setTerminalMessage(null)
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
        if (event.type === 'error') {
          setSessionStatus('failed')
          setTerminalReason('agent_error')
          setTerminalMessage(event.message)
        }
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
        const completionStatus = message.status ?? 'completed'
        setIsLoading(false)
        setPendingPermission(null)
        setSessionStatus(completionStatus)
        setTerminalReason(message.reason ?? null)
        const completionMessage =
          message.errorMessage
          ?? formatTerminalReason(message.reason ?? null)
          ?? null
        setTerminalMessage(completionMessage)
        updateSessionStatus(message.kombuseSessionId, completionStatus)

        if (
          (completionStatus === 'failed' || completionStatus === 'aborted')
          && completionMessage
        ) {
          const errorEvent: SerializedAgentErrorEvent = {
            type: 'error',
            eventId: crypto.randomUUID(),
            message: completionMessage,
            backend: 'mock',
            timestamp: Date.now(),
          }
          setEvents((prev) => [...prev, errorEvent])
        }
        refreshSessions()
        break
      }

      case 'error': {
        setIsLoading(false)
        setSessionStatus('failed')
        setTerminalReason('server_error')
        setTerminalMessage(message.message)
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
        userEventId: userEvent.eventId,
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
    eventSequenceByIdRef.current = new Map()
    setEvents([])
    setKombuseSessionId(null)
    setPendingPermission(null)
    setIsLoading(false)
    setSessionStatus(null)
    setTerminalReason(null)
    setTerminalMessage(null)
    setHistoryLoadedCount(null)
    setHistoryTotalCount(null)
  }, [])

  const backendSessionId = sessionData?.backend_session_id ?? null
  const effectiveBackend = sessionData?.effective_backend ?? sessionData?.backend_type ?? null
  const appliedModel = sessionData?.applied_model ?? null
  const sessionModelPreference = sessionData?.model_preference ?? null

  const value = useMemo(
    () => ({
      events,
      isLoading,
      isConnected,
      sessionStatus,
      terminalReason,
      terminalMessage,
      historyLoadedCount,
      historyTotalCount,
      kombuseSessionId: effectiveKombuseSessionId,
      backendSessionId,
      effectiveBackend,
      appliedModel,
      modelPreference: sessionModelPreference,
      pendingPermission,
      send,
      respondToPermission,
      reset,
    }),
    [
      events,
      isLoading,
      isConnected,
      sessionStatus,
      terminalReason,
      terminalMessage,
      historyLoadedCount,
      historyTotalCount,
      effectiveKombuseSessionId,
      backendSessionId,
      effectiveBackend,
      appliedModel,
      sessionModelPreference,
      pendingPermission,
      send,
      respondToPermission,
      reset,
    ]
  )

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>
}
