'use client'

import { createContext } from 'react'
import type { CommandRegistry, CommandContext } from '@kombuse/types'

export interface CommandContextValue {
  registry: CommandRegistry
  context: CommandContext
}

export const CommandCtx = createContext<CommandContextValue | null>(null)
