'use client'

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from 'react'
import type { CommandRegistry, CommandContext } from '@kombuse/types'
import { normalizeKeybinding, eventToKeybinding } from '@kombuse/core'

interface CommandContextValue {
  registry: CommandRegistry
  context: CommandContext
}

const CommandCtx = createContext<CommandContextValue | null>(null)

interface CommandProviderProps {
  registry: CommandRegistry
  context: CommandContext
  children: ReactNode
}

/**
 * Provides command registry and context to the component tree.
 * Also sets up global keyboard event listener for keybindings.
 */
export function CommandProvider({
  registry,
  context,
  children,
}: CommandProviderProps) {
  // Setup global keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      const pressed = eventToKeybinding(e)
      const command = registry.getAll().find((cmd) => {
        if (!cmd.keybinding) return false
        return normalizeKeybinding(cmd.keybinding) === pressed
      })

      if (command && (!command.when || command.when(context))) {
        e.preventDefault()
        registry.execute(command.id, context)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [registry, context])

  return (
    <CommandCtx.Provider value={{ registry, context }}>
      {children}
    </CommandCtx.Provider>
  )
}

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
