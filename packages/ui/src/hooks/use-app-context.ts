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

/**
 * Hook to access the default backend type from profile settings.
 */
export function useDefaultBackendType() {
  const { defaultBackendType, setDefaultBackendType } = useAppContext()
  return { defaultBackendType, setDefaultBackendType }
}

/**
 * Hook to access the set of smart label IDs (labels that trigger agents).
 * Returns a helper to check if a given label ID is "smart".
 */
export function useSmartLabels() {
  const { smartLabelIds } = useAppContext()
  return {
    smartLabelIds,
    isSmartLabel: (labelId: number) => smartLabelIds.has(labelId),
  }
}
