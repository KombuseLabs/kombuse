'use client'

import { useSyncExternalStore, useMemo } from 'react'
import type { Command } from '@kombuse/types'
import { useCommandContext } from './command-provider'

// Stable empty array for SSR
const EMPTY_COMMANDS: Command[] = []

/**
 * Hook to get all commands available in the current context.
 * Re-renders when commands are registered/unregistered.
 */
export function useCommands() {
  const { registry, context } = useCommandContext()

  // Get all commands with stable reference from registry
  const allCommands = useSyncExternalStore(
    registry.subscribe,
    () => registry.getAll(),
    () => EMPTY_COMMANDS
  )

  // Filter by context - memoized to avoid recreating on every render
  const availableCommands = useMemo(
    () => allCommands.filter((cmd) => !cmd.when || cmd.when(context)),
    [allCommands, context]
  )

  return availableCommands
}
