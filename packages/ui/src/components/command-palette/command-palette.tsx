'use client'

import { useMemo, useState, useCallback } from 'react'
import { Loader2, Ticket } from 'lucide-react'
import type { TicketWithLabels } from '@kombuse/types'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandItem,
  CommandGroup,
  CommandEmpty,
  CommandShortcut,
} from '../../base/command'
import { useCommands, useCommandContext, useTicketSearch } from '../../hooks'
import { formatKeybinding } from '@kombuse/core'
import { cn } from '../../lib/utils'
import { statusColors } from '../../lib/ticket-utils'

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

  const hasProjectId = context.currentProjectId != null

  // Search tickets when query is non-trivial (2+ chars, with or without # prefix)
  const ticketSearchTerm = useMemo(() => {
    if (query.startsWith('#')) return query.slice(1)
    return query
  }, [query])

  const { data: ticketResults = [], isLoading: isSearching } = useTicketSearch(
    ticketSearchTerm,
    { enabled: ticketSearchTerm.length >= 2 && hasProjectId }
  )

  // Exact #N match for direct "go to ticket" navigation
  const ticketMatch = useMemo(() => {
    const match = query.match(/^#(\d+)$/)
    if (!match?.[1]) return null
    const num = parseInt(match[1], 10)
    if (num <= 0 || !Number.isFinite(num)) return null
    return num
  }, [query])

  const canGoToTicket = ticketMatch !== null && hasProjectId
  const showTicketSection = canGoToTicket || (ticketResults.length > 0 && hasProjectId) || (isSearching && hasProjectId)

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
        placeholder="Type a command or search tickets..."
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
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
        {showTicketSection && (
          <CommandGroup heading="Tickets">
            {canGoToTicket && (
              <CommandItem
                value={`go-to-ticket-${ticketMatch}`}
                onSelect={() => handleGoToTicket(ticketMatch)}
              >
                <Ticket className="size-4" />
                <span>Go to Ticket #{ticketMatch}</span>
              </CommandItem>
            )}
            {isSearching && (
              <CommandItem value="ticket-search-loading" disabled>
                <Loader2 className="size-4 animate-spin" />
                <span className="text-muted-foreground">Searching tickets...</span>
              </CommandItem>
            )}
            {ticketResults.map((ticket: TicketWithLabels) => (
              <CommandItem
                key={`ticket-${ticket.id}`}
                value={`ticket-${ticket.id}-${ticket.title}`}
                onSelect={() => handleGoToTicket(ticket.id)}
              >
                <Ticket className="size-4" />
                <span className="shrink-0 font-mono text-xs text-muted-foreground">#{ticket.id}</span>
                <span className="truncate">{ticket.title}</span>
                <span
                  className={cn(
                    'ml-auto shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium',
                    statusColors[ticket.status]
                  )}
                >
                  {ticket.status.replace('_', ' ')}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
