'use client'

import { useState, useMemo, useCallback, type ReactNode } from 'react'
import type {
  Ticket,
  AppView,
  AppSession,
  AppContextValue,
  ServerMessage,
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
  const [pendingSessionIds, setPendingSessionIds] = useState<Set<string>>(
    () => new Set()
  )

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

  const addPendingSession = useCallback((kombuseSessionId: string) => {
    setPendingSessionIds((prev) => {
      if (prev.has(kombuseSessionId)) return prev
      const next = new Set(prev)
      next.add(kombuseSessionId)
      return next
    })
  }, [])

  const removePendingSession = useCallback((kombuseSessionId: string) => {
    setPendingSessionIds((prev) => {
      if (!prev.has(kombuseSessionId)) return prev
      const next = new Set(prev)
      next.delete(kombuseSessionId)
      return next
    })
  }, [])

  // Global WebSocket handler to track pending permissions for all sessions
  const handleMessage = useCallback(
    (message: ServerMessage) => {
      // Phase 1: Log permission_pending messages to verify data flow
      if ((message as any).type === 'agent.permission_pending') {
        console.log('[client] received permission_pending:', message)
      }

      switch (message.type) {
        case 'agent.event': {
          const event = message.event
          if (event.type === 'permission_request') {
            addPendingSession(message.kombuseSessionId)
          }
          break
        }
        case 'agent.complete': {
          removePendingSession(message.kombuseSessionId)
          break
        }
      }
    },
    [addPendingSession, removePendingSession]
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
      pendingSessionIds,
      // Actions
      setCurrentTicket,
      setCurrentProjectId,
      setView,
      setIsGenerating,
      setCurrentSession,
      addPendingSession,
      removePendingSession,
    }),
    [
      currentTicket,
      currentProjectId,
      view,
      isGenerating,
      currentSession,
      pendingSessionIds,
      setCurrentTicket,
      setCurrentProjectId,
      setView,
      setIsGenerating,
      setCurrentSession,
      addPendingSession,
      removePendingSession,
    ]
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
