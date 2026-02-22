'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Profile } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { Button } from '../../base/button'
import { Popover, PopoverContent, PopoverTrigger } from '../../base/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '../../base/command'
import { Bot, Check, ChevronsUpDown } from 'lucide-react'
import { useAgents, useAgentProfiles } from '../../hooks/use-agents'
import { useCommandContext } from '../../hooks/use-command-context'

interface AgentPickerProps {
  value: string | null
  onChange: (agentId: string | null) => void
  disabled?: boolean
  className?: string
  projectId?: string | null
}

function AgentPicker({ value, onChange, disabled, className, projectId }: AgentPickerProps) {
  const [open, setOpen] = useState(false)

  const { registry } = useCommandContext()
  const { data: agents } = useAgents({ is_enabled: true, enabled_for_chat: true, project_id: projectId ?? undefined })
  const { data: profiles } = useAgentProfiles()

  const profileMap = useMemo(() => {
    const map = new Map<string, Profile>()
    if (profiles) {
      for (const p of profiles) {
        map.set(p.id, p)
      }
    }
    return map
  }, [profiles])

  const chatAgents = useMemo(() => agents ?? [], [agents])

  const selectedAgent = chatAgents.find((a) => a.id === value) ?? null
  const selectedProfile = value ? profileMap.get(value) ?? null : null
  const displayName = selectedProfile?.name ?? selectedAgent?.id ?? null

  const handleSelect = useCallback(
    (agentId: string | null) => {
      onChange(agentId)
      setOpen(false)
    },
    [onChange],
  )

  // Shift+Tab cycles through agents (via command system)
  useEffect(() => {
    if (disabled) return

    const unregister = registry.register({
      id: 'agent-picker.cycle',
      title: 'Cycle Agent',
      category: 'Chat',
      keybinding: 'shift+tab',
      handler: () => {
        if (chatAgents.length === 0) return

        const currentIndex = value ? chatAgents.findIndex((a) => a.id === value) : -1
        if (currentIndex === -1) {
          onChange(chatAgents[0]!.id)
        } else if (currentIndex === chatAgents.length - 1) {
          onChange(null)
        } else {
          onChange(chatAgents[currentIndex + 1]!.id)
        }
      },
    })

    return unregister
  }, [registry, disabled, value, chatAgents, onChange])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('justify-between', className)}
          disabled={disabled}
          size="sm"
        >
          <span className="flex items-center gap-2">
            <Bot className="size-4 shrink-0" />
            <span className="truncate">{displayName ?? 'No agent'}</span>
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search agents..." />
          <CommandList>
            <CommandEmpty>No agents found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => handleSelect(null)}
                className="flex items-center gap-2"
              >
                <span className="flex-1">No agent</span>
                {value === null && <Check className="size-4 text-primary shrink-0" />}
              </CommandItem>
              {chatAgents.map((agent) => {
                const profile = profileMap.get(agent.id)
                const name = profile?.name ?? agent.id
                return (
                  <CommandItem
                    key={agent.id}
                    value={name}
                    onSelect={() => handleSelect(agent.id)}
                    className="flex items-center gap-2"
                  >
                    <Bot className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{name}</span>
                    {value === agent.id && (
                      <Check className="size-4 text-primary shrink-0" />
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { AgentPicker }
export type { AgentPickerProps }
