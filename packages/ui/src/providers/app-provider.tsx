'use client'

import { useState, useMemo, useCallback, type ReactNode } from 'react'
import type {
  Ticket,
  AppView,
  AppSession,
  AppContextValue,
  ServerMessage,
  PendingPermission,
} from '@kombuse/types'
import { AppCtx } from './app-context'
import { useWebSocket } from '../hooks/use-websocket'

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

  // Global WebSocket handler to track pending permissions for all sessions
  const handleMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case 'agent.permission_pending': {
          // Phase 1: Log permission_pending messages to verify data flow
          console.log('[client] received permission_pending:', message)
          addPendingPermission({
            sessionId: message.sessionId,
            requestId: message.requestId,
            toolName: message.toolName,
            input: message.input,
          })
          break
        }
        case 'agent.permission_resolved': {
          removePendingPermission(message.requestId)
          break
        }
        case 'agent.complete': {
          // Clear all pending permissions for this session
          clearPendingPermissionsForSession(message.kombuseSessionId)
          break
        }
      }
    },
    [addPendingPermission, removePendingPermission, clearPendingPermissionsForSession]
  )

  useWebSocket({ topics: ['*'], onMessage: handleMessage })

  const value = useMemo<AppContextValue>(
    () => ({
      // State
      currentTicket,
      currentProjectId,
      view,
      isGenerating,
      currentSession,
      pendingPermissions,
      // Actions
      setCurrentTicket,
      setCurrentProjectId,
      setView,
      setIsGenerating,
      setCurrentSession,
      addPendingPermission,
      removePendingPermission,
      clearPendingPermissionsForSession,
    }),
    [
      currentTicket,
      currentProjectId,
      view,
      isGenerating,
      currentSession,
      pendingPermissions,
      setCurrentTicket,
      setCurrentProjectId,
      setView,
      setIsGenerating,
      setCurrentSession,
      addPendingPermission,
      removePendingPermission,
      clearPendingPermissionsForSession,
    ]
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
