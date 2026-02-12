'use client'

import { useState, useMemo, useCallback, useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type {
  Ticket,
  AppView,
  AppSession,
  AppContextValue,
  ServerMessage,
  PendingPermission,
  TicketAgentStatus,
  ActiveSessionInfo,
} from '@kombuse/types'
import { AppCtx } from './app-context'
import { useWebSocket } from '../hooks/use-websocket'
import { syncApi } from '../lib/api'

interface AppProviderProps {
  children: ReactNode
  initialView?: AppView
  initialProjectId?: string | null
}

/**
 * Provides centralized application state to the component tree.
 * Manages current ticket, project, view, and generation state.
 */
export function AppProvider({
  children,
  initialView = null,
  initialProjectId = null,
}: AppProviderProps) {
  const queryClient = useQueryClient()
  const [currentTicket, setCurrentTicketState] = useState<Ticket | null>(null)
  const [currentProjectId, setCurrentProjectIdState] = useState<string | null>(
    initialProjectId
  )
  const [view, setViewState] = useState<AppView>(initialView)
  const [isGenerating, setIsGeneratingState] = useState(false)
  const [currentSession, setCurrentSessionState] = useState<AppSession | null>(
    null
  )
  const [pendingPermissions, setPendingPermissions] = useState<
    Map<string, PendingPermission>
  >(() => new Map())
  const [ticketAgentStatus, setTicketAgentStatus] = useState<
    Map<number, TicketAgentStatus>
  >(() => new Map())
  const [activeSessions, setActiveSessions] = useState<
    Map<string, ActiveSessionInfo>
  >(() => new Map())

  // Wrap setters in useCallback for stable references
  const setCurrentTicket = useCallback((ticket: Ticket | null) => {
    setCurrentTicketState(ticket)
  }, [])

  const setCurrentProjectId = useCallback((projectId: string | null) => {
    setCurrentProjectIdState(projectId)
  }, [])

  const setView = useCallback((newView: AppView) => {
    setViewState(newView)
  }, [])

  const setIsGenerating = useCallback((generating: boolean) => {
    setIsGeneratingState(generating)
  }, [])

  const setCurrentSession = useCallback((session: AppSession | null) => {
    setCurrentSessionState(session)
  }, [])

  const addPendingPermission = useCallback((permission: PendingPermission) => {
    setPendingPermissions((prev) => {
      if (prev.has(permission.requestId)) return prev
      const next = new Map(prev)
      next.set(permission.requestId, permission)
      return next
    })
  }, [])

  const removePendingPermission = useCallback((requestId: string) => {
    setPendingPermissions((prev) => {
      if (!prev.has(requestId)) return prev
      const next = new Map(prev)
      next.delete(requestId)
      return next
    })
  }, [])

  const clearPendingPermissionsForSession = useCallback((sessionId: string) => {
    setPendingPermissions((prev) => {
      const toRemove = [...prev.values()].filter((p) => p.sessionId === sessionId)
      if (toRemove.length === 0) return prev
      const next = new Map(prev)
      for (const p of toRemove) {
        next.delete(p.requestId)
      }
      return next
    })
  }, [])

  const updateTicketAgentStatus = useCallback(
    (ticketId: number, status: TicketAgentStatus) => {
      setTicketAgentStatus((prev) => {
        const next = new Map(prev)
        next.set(ticketId, status)
        return next
      })
    },
    []
  )

  const getTicketAgentStatus = useCallback(
    (ticketId: number): TicketAgentStatus | undefined => {
      return ticketAgentStatus.get(ticketId)
    },
    [ticketAgentStatus]
  )

  const addActiveSession = useCallback((session: ActiveSessionInfo) => {
    setActiveSessions((prev) => {
      if (prev.has(session.kombuseSessionId)) return prev
      const next = new Map(prev)
      next.set(session.kombuseSessionId, session)
      return next
    })
  }, [])

  const removeActiveSession = useCallback((kombuseSessionId: string) => {
    setActiveSessions((prev) => {
      if (!prev.has(kombuseSessionId)) return prev
      const next = new Map(prev)
      next.delete(kombuseSessionId)
      return next
    })
  }, [])

  // Global WebSocket handler to track pending permissions and ticket agent status
  const handleMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case 'agent.started': {
          addActiveSession({
            kombuseSessionId: message.kombuseSessionId,
            agentName: message.agentName ?? 'Agent',
            ticketId: message.ticketId,
            startedAt: message.startedAt ?? new Date().toISOString(),
          })
          void queryClient.invalidateQueries({ queryKey: ['sessions'] })
          break
        }
        case 'agent.permission_pending': {
          console.log('[client] received permission_pending:', message)
          addPendingPermission({
            sessionId: message.sessionId,
            requestId: message.requestId,
            toolName: message.toolName,
            input: message.input,
            description: message.description,
            ticketId: message.ticketId,
          })
          break
        }
        case 'agent.permission_resolved': {
          removePendingPermission(message.requestId)
          break
        }
        case 'agent.complete': {
          clearPendingPermissionsForSession(message.kombuseSessionId)
          removeActiveSession(message.kombuseSessionId)
          void queryClient.invalidateQueries({ queryKey: ['sessions'] })
          break
        }
        case 'ticket.agent_status': {
          updateTicketAgentStatus(message.ticketId, {
            status: message.status,
            sessionCount: message.sessionCount,
          })
          break
        }
      }
    },
    [queryClient, addPendingPermission, removePendingPermission, clearPendingPermissionsForSession, updateTicketAgentStatus, addActiveSession, removeActiveSession]
  )

  useWebSocket({ topics: ['*'], onMessage: handleMessage })

  // Fetch current state on mount to recover from page reload
  useEffect(() => {
    let cancelled = false
    syncApi.getState().then((state) => {
      if (cancelled) return
      for (const perm of state.pendingPermissions) {
        addPendingPermission(perm)
      }
      for (const tas of state.ticketAgentStatuses) {
        updateTicketAgentStatus(tas.ticketId, {
          status: tas.status,
          sessionCount: tas.sessionCount,
        })
      }
      for (const session of state.activeSessions) {
        addActiveSession(session)
      }
    }).catch((err) => {
      console.error('[app-provider] Failed to fetch sync state:', err)
    })
    return () => { cancelled = true }
  }, [addPendingPermission, updateTicketAgentStatus, addActiveSession])

  const value = useMemo<AppContextValue>(
    () => ({
      // State
      currentTicket,
      currentProjectId,
      view,
      isGenerating,
      currentSession,
      pendingPermissions,
      ticketAgentStatus,
      activeSessions,
      // Actions
      setCurrentTicket,
      setCurrentProjectId,
      setView,
      setIsGenerating,
      setCurrentSession,
      addPendingPermission,
      removePendingPermission,
      clearPendingPermissionsForSession,
      updateTicketAgentStatus,
      getTicketAgentStatus,
      addActiveSession,
      removeActiveSession,
    }),
    [
      currentTicket,
      currentProjectId,
      view,
      isGenerating,
      currentSession,
      pendingPermissions,
      ticketAgentStatus,
      activeSessions,
      setCurrentTicket,
      setCurrentProjectId,
      setView,
      setIsGenerating,
      setCurrentSession,
      addPendingPermission,
      removePendingPermission,
      clearPendingPermissionsForSession,
      updateTicketAgentStatus,
      getTicketAgentStatus,
      addActiveSession,
      removeActiveSession,
    ]
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
