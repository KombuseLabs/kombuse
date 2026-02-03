'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTheme } from 'next-themes'
import { createCommandRegistry } from '@kombuse/core'
import { CommandProvider } from '@kombuse/ui/commands'
import { CommandPalette } from '@kombuse/ui/command-palette'
import type { CommandContext } from '@kombuse/types'

interface CommandSetupProps {
  children: React.ReactNode
}

export function CommandSetup({ children }: CommandSetupProps) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { setTheme, resolvedTheme } = useTheme()

  const registry = useMemo(() => createCommandRegistry(), [])

  // Register commands
  useEffect(() => {
    const unregisterFns = [
      registry.register({
        id: 'palette.open',
        title: 'Open Command Palette',
        category: 'General',
        keybinding: 'mod+k',
        handler: () => setPaletteOpen(true),
      }),
      registry.register({
        id: 'theme.toggle',
        title: 'Toggle Dark Mode',
        category: 'General',
        keybinding: 'mod+shift+d',
        handler: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
      }),
      registry.register({
        id: 'theme.light',
        title: 'Switch to Light Mode',
        category: 'Theme',
        handler: () => setTheme('light'),
      }),
      registry.register({
        id: 'theme.dark',
        title: 'Switch to Dark Mode',
        category: 'Theme',
        handler: () => setTheme('dark'),
      }),
      registry.register({
        id: 'theme.system',
        title: 'Use System Theme',
        category: 'Theme',
        handler: () => setTheme('system'),
      }),
    ]

    return () => unregisterFns.forEach((fn) => fn())
  }, [registry, setTheme, resolvedTheme])

  const context: CommandContext = {
    view: 'home',
  }

  return (
    <CommandProvider registry={registry} context={context}>
      {children}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </CommandProvider>
  )
}
