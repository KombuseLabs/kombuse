'use client'

import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { Loader2, Ticket } from 'lucide-react'
import type { Command as CommandType, TicketWithLabels } from '@kombuse/types'
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandGroup,
  CommandEmpty,
  CommandShortcut,
} from '../../base/command'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '../../base/popover'
import { useCommands, useCommandContext, useTicketSearch } from '../../hooks'
import { formatKeybinding } from '@kombuse/core'
import { cn } from '../../lib/utils'
import { statusColors } from '../../lib/ticket-utils'
import { SearchBar } from './search-bar'

function HighlightedSnippet({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g)
  return (
    <span className="line-clamp-1">
      {parts.map((part, i) => {
        if (part.startsWith('«') && part.endsWith('»')) {
          return (
            <mark key={i} className="rounded-sm bg-yellow-200 dark:bg-yellow-800">
              {part.slice(1, -1)}
            </mark>
          )
        }
        return part
      })}
    </span>
  )
}

export function filterAndGroupCommands(
  commands: CommandType[],
  query: string
): Record<string, CommandType[]> {
  const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean)
  const filtered = commands.filter((cmd) => {
    const searchable = [cmd.title, cmd.category, cmd.description]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return queryWords.every((word) => searchable.includes(word))
  })

  return filtered.reduce(
    (acc, cmd) => {
      const cat = cmd.category ?? 'General'
      ;(acc[cat] ??= []).push(cmd)
      return acc
    },
    {} as Record<string, CommandType[]>
  )
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate?: (path: string) => void
}

/**
 * Command palette component that displays all available commands.
 * Renders as a popover anchored to a search bar trigger.
 * Filters commands based on search query and groups by category.
 * Supports #N pattern to navigate directly to a ticket by number.
 */
export function CommandPalette({ open, onOpenChange, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const commands = useCommands()
  const { registry, context } = useCommandContext()
  const inputRef = useRef<HTMLInputElement>(null)

  const hasProjectId = context.currentProjectId != null

  // Reset query when palette closes
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  // Search tickets when query is non-trivial (2+ chars, with or without # prefix)
  const ticketSearchTerm = useMemo(() => {
    if (query.startsWith('#')) return query.slice(1)
    return query
  }, [query])

  const { data: ticketResults = [], isLoading: isSearching } = useTicketSearch(
    ticketSearchTerm,
    { enabled: ticketSearchTerm.length >= 2 }
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
  const showTicketSection = canGoToTicket || ticketResults.length > 0 || isSearching

  const grouped = useMemo(() => filterAndGroupCommands(commands, query), [commands, query])

  const handleSelect = useCallback(
    async (commandId: string) => {
      onOpenChange(false)
      setQuery('')
      await registry.execute(commandId, context)
    },
    [registry, context, onOpenChange]
  )

  const handleGoToTicket = useCallback(
    (ticketNumber: number, ticketProjectId?: string) => {
      onOpenChange(false)
      setQuery('')
      const projectId = context.currentProjectId ?? ticketProjectId
      onNavigate?.(`/projects/${projectId}/tickets/${ticketNumber}`)
    },
    [onOpenChange, onNavigate, context.currentProjectId]
  )

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <SearchBar />
      </PopoverTrigger>
      <PopoverContent
        className="w-[500px] max-w-[calc(100vw-2rem)] p-0 shadow-lg"
        align="center"
        sideOffset={8}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          <CommandInput
            ref={inputRef}
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
                    onSelect={() => handleGoToTicket(ticket.id, ticket.project_id)}
                  >
                    <Ticket className="size-4" />
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">#{ticket.id}</span>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{ticket.title}</span>
                      {ticket.match_context && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span className="shrink-0 text-[10px] opacity-60">
                            {ticket.match_source === 'comment' ? 'Comment:' : 'Body:'}
                          </span>
                          <HighlightedSnippet text={ticket.match_context} />
                        </span>
                      )}
                    </div>
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
        </Command>
      </PopoverContent>
    </Popover>
  )
}
