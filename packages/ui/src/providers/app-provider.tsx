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
  BackendType,
} from '@kombuse/types'
import { BACKEND_TYPES } from '@kombuse/types'
import { createBrowserLogger } from '@kombuse/core/browser-logger'
import { AppCtx } from './app-context'

const logger = createBrowserLogger('AppProvider')
import { useWebSocket } from '../hooks/use-websocket'
import { syncApi, labelsApi } from '../lib/api'
import { sessionKeys, ticketKeys } from '../lib/query-keys'

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
  const [defaultBackendType, setDefaultBackendTypeState] = useState<BackendType>(BACKEND_TYPES.CLAUDE_CODE)
  const [smartLabelIds, setSmartLabelIdsState] = useState<Set<number>>(() => new Set())

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
      if (prev.has(permission.permissionKey)) return prev
      const next = new Map(prev)
      next.set(permission.permissionKey, permission)
      return next
    })
  }, [])

  const removePendingPermission = useCallback((permissionKey: string) => {
    setPendingPermissions((prev) => {
      if (!prev.has(permissionKey)) return prev
      const next = new Map(prev)
      next.delete(permissionKey)
      return next
    })
  }, [])

  const clearPendingPermissionsForSession = useCallback((sessionId: string) => {
    setPendingPermissions((prev) => {
      const toRemove = [...prev.values()].filter((p) => p.sessionId === sessionId)
      if (toRemove.length === 0) return prev
      const next = new Map(prev)
      for (const p of toRemove) {
        next.delete(p.permissionKey)
      }
      return next
    })
  }, [])

  const updateTicketAgentStatus = useCallback(
    (ticketNumber: number, status: TicketAgentStatus) => {
      setTicketAgentStatus((prev) => {
        const next = new Map(prev)
        next.set(ticketNumber, status)
        return next
      })
    },
    []
  )

  const getTicketAgentStatus = useCallback(
    (ticketNumber: number): TicketAgentStatus | undefined => {
      return ticketAgentStatus.get(ticketNumber)
    },
    [ticketAgentStatus]
  )

  const addActiveSession = useCallback((session: ActiveSessionInfo) => {
    setActiveSessions((prev) => {
      const existing = prev.get(session.kombuseSessionId)
      if (!existing) {
        const next = new Map(prev)
        next.set(session.kombuseSessionId, session)
        return next
      }

      const existingStartMs = Date.parse(existing.startedAt)
      const incomingStartMs = Date.parse(session.startedAt)
      const hasExistingStart = Number.isFinite(existingStartMs)
      const hasIncomingStart = Number.isFinite(incomingStartMs)
      const startedAt = hasExistingStart && hasIncomingStart
        ? incomingStartMs < existingStartMs
          ? session.startedAt
          : existing.startedAt
        : hasExistingStart
          ? existing.startedAt
          : session.startedAt

      const merged: ActiveSessionInfo = {
        ...existing,
        ...session,
        startedAt,
      }

      if (
        existing.agentName === merged.agentName
        && existing.ticketNumber === merged.ticketNumber
        && existing.ticketTitle === merged.ticketTitle
        && existing.projectId === merged.projectId
        && existing.effectiveBackend === merged.effectiveBackend
        && existing.appliedModel === merged.appliedModel
        && existing.startedAt === merged.startedAt
      ) {
        return prev
      }

      const next = new Map(prev)
      next.set(session.kombuseSessionId, merged)
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

  const setDefaultBackendType = useCallback((backendType: BackendType) => {
    setDefaultBackendTypeState(backendType)
  }, [])

  const setSmartLabelIds = useCallback((ids: Set<number>) => {
    setSmartLabelIdsState((prev) => {
      if (prev.size === ids.size && [...ids].every((id) => prev.has(id))) {
        return prev
      }
      return ids
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
            ticketNumber: message.ticketNumber,
            ticketTitle: message.ticketTitle,
            projectId: message.projectId,
            effectiveBackend: message.effectiveBackend,
            appliedModel: message.appliedModel,
            startedAt: message.startedAt ?? new Date().toISOString(),
          })
          void queryClient.invalidateQueries({ queryKey: sessionKeys.all })
          break
        }
        case 'agent.permission_pending': {
          logger.info('received permission_pending')
          addPendingPermission({
            permissionKey: message.permissionKey,
            sessionId: message.sessionId,
            requestId: message.requestId,
            toolName: message.toolName,
            input: message.input,
            description: message.description,
            ticketNumber: message.ticketNumber,
            projectId: message.projectId,
          })
          break
        }
        case 'agent.permission_resolved': {
          removePendingPermission(message.permissionKey)
          break
        }
        case 'agent.complete': {
          clearPendingPermissionsForSession(message.kombuseSessionId)
          removeActiveSession(message.kombuseSessionId)
          void queryClient.invalidateQueries({ queryKey: sessionKeys.all })
          break
        }
        case 'ticket.agent_status': {
          if (message.status === 'idle') {
            setTicketAgentStatus((prev) => {
              if (!prev.has(message.ticketNumber)) return prev
              const next = new Map(prev)
              next.delete(message.ticketNumber)
              return next
            })
          } else {
            updateTicketAgentStatus(message.ticketNumber, {
              status: message.status,
              sessionCount: message.sessionCount,
            })
          }
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
        if (tas.status !== 'idle') {
          updateTicketAgentStatus(tas.ticketNumber, {
            status: tas.status,
            sessionCount: tas.sessionCount,
          })
        }
      }
      for (const session of state.activeSessions) {
        addActiveSession(session)
      }
    }).catch((err) => {
      logger.error('Failed to fetch sync state', { error: err instanceof Error ? err.message : String(err) })
    })
    return () => { cancelled = true }
  }, [addPendingPermission, updateTicketAgentStatus, addActiveSession])

  // Periodic sync poll to reconcile stale client state (e.g. after idle timeout or server restart)
  useEffect(() => {
    const interval = setInterval(() => {
      syncApi.getState().then((state) => {
        const serverSessionIds = new Set(state.activeSessions.map((s) => s.kombuseSessionId))

        // Remove stale client sessions not on server
        setActiveSessions((prev) => {
          let changed = false
          const next = new Map(prev)
          for (const key of prev.keys()) {
            if (!serverSessionIds.has(key)) {
              next.delete(key)
              changed = true
            }
          }
          if (!changed) return prev
          return next
        })

        // Add missing server sessions
        for (const session of state.activeSessions) {
          addActiveSession(session)
        }

        // Reconcile ticket agent statuses: full snapshot replacement.
        // Idle entries are omitted (absence from map = idle).
        setTicketAgentStatus((prev) => {
          const next = new Map<number, TicketAgentStatus>()
          for (const tas of state.ticketAgentStatuses) {
            if (tas.status !== 'idle') {
              next.set(tas.ticketNumber, { status: tas.status, sessionCount: tas.sessionCount })
            }
          }
          if (next.size === prev.size) {
            let same = true
            for (const [id, entry] of next) {
              const p = prev.get(id)
              if (!p || p.status !== entry.status || p.sessionCount !== entry.sessionCount) { same = false; break }
            }
            if (same) return prev
          }
          return next
        })
        // Invalidate ticket queries as a fallback for missed WebSocket events
        queryClient.invalidateQueries({ queryKey: ticketKeys.all, exact: false })
      }).catch(() => {})
    }, 30_000)
    return () => clearInterval(interval)
  }, [addActiveSession, queryClient])

  // Fetch smart label IDs when project changes
  useEffect(() => {
    if (!currentProjectId) {
      setSmartLabelIds(new Set())
      return
    }
    let cancelled = false
    labelsApi.getSmartLabelIds(currentProjectId).then((ids) => {
      if (!cancelled) {
        setSmartLabelIds(new Set(ids))
      }
    }).catch((err) => {
      logger.error('Failed to fetch smart label IDs', { error: err instanceof Error ? err.message : String(err) })
    })
    return () => { cancelled = true }
  }, [currentProjectId, setSmartLabelIds])

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
      defaultBackendType,
      smartLabelIds,
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
      setDefaultBackendType,
      setSmartLabelIds,
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
      defaultBackendType,
      smartLabelIds,
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
      setDefaultBackendType,
      setSmartLabelIds,
    ]
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
