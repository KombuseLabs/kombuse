'use client'

import { useCallback } from 'react'
import { useCommandContext } from './command-provider'

/**
 * Hook to work with a specific command by ID.
 * Returns the command, whether it's available, and an execute function.
 */
export function useCommand(id: string) {
  const { registry, context } = useCommandContext()

  const execute = useCallback(
    (...args: unknown[]) => registry.execute(id, context, ...args),
    [registry, context, id]
  )

  const command = registry.get(id)
  const available = command && (!command.when || command.when(context))

  return { execute, command, available }
}
