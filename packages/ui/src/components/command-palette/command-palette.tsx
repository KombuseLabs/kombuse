'use client'

import { useMemo, useState, useCallback } from 'react'
import { Ticket } from 'lucide-react'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandItem,
  CommandGroup,
  CommandEmpty,
  CommandShortcut,
} from '../../base/command'
import { useCommands, useCommandContext } from '../../hooks'
import { formatKeybinding } from '@kombuse/core'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate?: (path: string) => void
}

/**
 * Command palette component that displays all available commands.
 * Filters commands based on search query and groups by category.
 * Supports #N pattern to navigate directly to a ticket by number.
 */
export function CommandPalette({ open, onOpenChange, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const commands = useCommands()
  const { registry, context } = useCommandContext()

  const ticketMatch = useMemo(() => {
    const match = query.match(/^#(\d+)$/)
    if (!match?.[1]) return null
    const num = parseInt(match[1], 10)
    if (num <= 0 || !Number.isFinite(num)) return null
    return num
  }, [query])

  const canGoToTicket = ticketMatch !== null && context.currentProjectId != null

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

  const handleGoToTicket = useCallback(
    (ticketNumber: number) => {
      onOpenChange(false)
      setQuery('')
      onNavigate?.(`/projects/${context.currentProjectId}/tickets/${ticketNumber}`)
    },
    [onOpenChange, onNavigate, context.currentProjectId]
  )

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command Palette" shouldFilter={false}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Type a command or #ticket number..."
      />
      <CommandList>
        <CommandEmpty>No commands found.</CommandEmpty>
        {canGoToTicket && (
          <CommandGroup heading="Navigation">
            <CommandItem
              value={`go-to-ticket-${ticketMatch}`}
              onSelect={() => handleGoToTicket(ticketMatch)}
            >
              <Ticket className="size-4" />
              <span>Go to Ticket #{ticketMatch}</span>
            </CommandItem>
          </CommandGroup>
        )}
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
