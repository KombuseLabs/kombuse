'use client'

import { useState, useMemo, useCallback, type ReactNode } from 'react'
import type { Ticket, AppView, AppSession, AppContextValue } from '@kombuse/types'
import { AppCtx } from './app-context'

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

  const value = useMemo<AppContextValue>(
    () => ({
      // State
      currentTicket,
      currentProjectId,
      view,
      isGenerating,
      currentSession,
      // Actions
      setCurrentTicket,
      setCurrentProjectId,
      setView,
      setIsGenerating,
      setCurrentSession,
    }),
    [
      currentTicket,
      currentProjectId,
      view,
      isGenerating,
      currentSession,
      setCurrentTicket,
      setCurrentProjectId,
      setView,
      setIsGenerating,
      setCurrentSession,
    ]
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
