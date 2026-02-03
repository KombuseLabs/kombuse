'use client'

import { useContext } from 'react'
import { CommandCtx } from '../providers/command-context'

/**
 * Hook to access the command registry and context.
 * Must be used within a CommandProvider.
 */
export function useCommandContext() {
  const ctx = useContext(CommandCtx)
  if (!ctx) {
    throw new Error('useCommandContext must be used within CommandProvider')
  }
  return ctx
}
