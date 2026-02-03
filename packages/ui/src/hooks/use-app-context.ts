'use client'

import { useContext } from 'react'
import { AppCtx } from '../providers/app-context'

/**
 * Hook to access the full application context.
 * Must be used within an AppProvider.
 */
export function useAppContext() {
  const ctx = useContext(AppCtx)
  if (!ctx) {
    throw new Error('useAppContext must be used within AppProvider')
  }
  return ctx
}

/**
 * Hook to access only the current ticket state.
 * Use this for components that only care about the ticket.
 */
export function useCurrentTicket() {
  const { currentTicket, setCurrentTicket } = useAppContext()
  return { currentTicket, setCurrentTicket }
}

/**
 * Hook to access only the current project state.
 */
export function useCurrentProject() {
  const { currentProjectId, setCurrentProjectId } = useAppContext()
  return { currentProjectId, setCurrentProjectId }
}

/**
 * Hook to access the current view state.
 */
export function useAppView() {
  const { view, setView } = useAppContext()
  return { view, setView }
}

/**
 * Hook to access the generation state.
 */
export function useGenerating() {
  const { isGenerating, setIsGenerating } = useAppContext()
  return { isGenerating, setIsGenerating }
}
