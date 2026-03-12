'use client'

import { useState, useMemo, useCallback } from 'react'
import type { ActorType, Profile } from '@kombuse/types'
import { cn } from '@/lib/utils'
import { Button } from '@/base/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/base/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/base/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/base/command'
import { Bot, Check, ChevronsUpDown } from 'lucide-react'
import { useAgents, useAgentProfiles } from '@/hooks/use-agents'

export interface AuthorFilterValue {
  authorType: ActorType | null
  authorIds: string[]
}

export interface AuthorFilterPickerProps {
  value: AuthorFilterValue
  onValueChange: (value: AuthorFilterValue) => void
  disabled?: boolean
  projectId?: string
}

const ANY_AUTHOR_SENTINEL = '__any__'

const AUTHOR_TYPE_OPTIONS = [
  { value: ANY_AUTHOR_SENTINEL, label: 'Any author (no filter)' },
  { value: 'user' as const, label: 'Human users only' },
  { value: 'agent' as const, label: 'Agents only' },
]

export function getAuthorFilterLabel(authorType: string, agentNames?: string[]): string {
  if (authorType === 'user') return 'Human only'
  if (authorType === 'agent') {
    if (agentNames && agentNames.length > 0) {
      const display =
        agentNames.length <= 2
          ? agentNames.join(', ')
          : `${agentNames.slice(0, 2).join(', ')} +${agentNames.length - 2}`
      return `Agents: ${display}`
    }
    return 'Agent only'
  }
  return authorType
}

function AuthorFilterPicker({ value, onValueChange, disabled, projectId }: AuthorFilterPickerProps) {
  const [open, setOpen] = useState(false)

  const { data: agents } = useAgents({ is_enabled: true, project_id: projectId })
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

  const enabledAgents = useMemo(() => agents ?? [], [agents])

  const handleTypeChange = useCallback(
    (v: string) => {
      if (v === ANY_AUTHOR_SENTINEL) {
        onValueChange({ authorType: null, authorIds: [] })
      } else if (v === 'user') {
        onValueChange({ authorType: 'user', authorIds: [] })
      } else if (v === 'agent') {
        onValueChange({ authorType: 'agent', authorIds: value.authorIds })
      }
    },
    [onValueChange, value.authorIds]
  )

  const handleToggleAgent = useCallback(
    (agentId: string) => {
      const current = value.authorIds
      const next = current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId]
      onValueChange({ ...value, authorIds: next })
    },
    [value, onValueChange]
  )

  const buttonLabel = useMemo(() => {
    if (value.authorIds.length === 0) return 'All agents'
    if (value.authorIds.length === 1) {
      const profile = profileMap.get(value.authorIds[0]!)
      return profile?.name ?? value.authorIds[0]
    }
    return `${value.authorIds.length} agents selected`
  }, [value.authorIds, profileMap])

  return (
    <div className="space-y-2">
      <Select
        value={value.authorType ?? ANY_AUTHOR_SENTINEL}
        onValueChange={handleTypeChange}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Any author (no filter)" />
        </SelectTrigger>
        <SelectContent>
          {AUTHOR_TYPE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value.authorType === 'agent' && (
        <div className="space-y-1">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className={cn('w-full justify-between')}
                disabled={disabled}
                size="sm"
                type="button"
              >
                <span className="flex items-center gap-2">
                  <Bot className="size-4 shrink-0" />
                  <span className="truncate">{buttonLabel}</span>
                </span>
                <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search agents..." />
                <CommandList>
                  <CommandEmpty>No agents found.</CommandEmpty>
                  <CommandGroup>
                    {enabledAgents.map((agent) => {
                      const profile = profileMap.get(agent.id)
                      const name = profile?.name ?? agent.id
                      const isSelected = value.authorIds.includes(agent.id)
                      return (
                        <CommandItem
                          key={agent.id}
                          value={name}
                          onSelect={() => handleToggleAgent(agent.id)}
                          className="flex items-center gap-2"
                        >
                          <Bot className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate">{name}</span>
                          {isSelected && (
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
          <p className="text-xs text-muted-foreground">
            Leave empty for any agent
          </p>
        </div>
      )}
    </div>
  )
}

export { AuthorFilterPicker }
