'use client'

import { useMemo, useState, useCallback } from 'react'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandItem,
  CommandGroup,
  CommandEmpty,
  CommandShortcut,
} from '../base/command'
import { useCommands, useCommandContext } from '../commands'
import { formatKeybinding } from '@kombuse/core'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Command palette component that displays all available commands.
 * Filters commands based on search query and groups by category.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const commands = useCommands()
  const { registry, context } = useCommandContext()

  const grouped = useMemo(() => {
    const filtered = commands.filter(
      (cmd) =>
        cmd.title.toLowerCase().includes(query.toLowerCase()) ||
        cmd.category?.toLowerCase().includes(query.toLowerCase()) ||
        cmd.description?.toLowerCase().includes(query.toLowerCase())
    )

    return filtered.reduce(
      (acc, cmd) => {
        const cat = cmd.category ?? 'General'
        ;(acc[cat] ??= []).push(cmd)
        return acc
      },
      {} as Record<string, typeof commands>
    )
  }, [commands, query])

  const handleSelect = useCallback(
    async (commandId: string) => {
      onOpenChange(false)
      setQuery('')
      await registry.execute(commandId, context)
    },
    [registry, context, onOpenChange]
  )

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command Palette">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Type a command..."
      />
      <CommandList>
        <CommandEmpty>No commands found.</CommandEmpty>
        {Object.entries(grouped).map(([category, cmds]) => (
          <CommandGroup key={category} heading={category}>
            {cmds.map((cmd) => (
              <CommandItem
                key={cmd.id}
                value={cmd.id}
                onSelect={() => handleSelect(cmd.id)}
              >
                <span>{cmd.title}</span>
                {cmd.keybinding && (
                  <CommandShortcut>
                    {formatKeybinding(cmd.keybinding)}
                  </CommandShortcut>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
