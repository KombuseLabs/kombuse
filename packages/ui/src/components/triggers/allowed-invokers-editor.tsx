'use client'

import { useState, useMemo } from 'react'
import type { AllowedInvoker, Agent, Profile } from '@kombuse/types'
import { Bot, Check, ChevronsUpDown, Plus, Shield, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/base/button'
import { Label } from '@/base/label'
import { Switch } from '@/base/switch'
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
import { useAgents, useAgentProfiles } from '@/hooks/use-agents'

export interface AllowedInvokersEditorProps {
  value: AllowedInvoker[] | null
  onChange: (value: AllowedInvoker[] | null) => void
  disabled?: boolean
  projectId?: string
}

const INVOKER_TYPE_OPTIONS = [
  { value: 'any', label: 'Anyone' },
  { value: 'user', label: 'Human users' },
  { value: 'agent', label: 'Agent' },
  { value: 'system', label: 'System' },
] as const

function AllowedInvokersEditor({ value, onChange, disabled, projectId }: AllowedInvokersEditorProps) {
  const isRestricted = value !== null

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

  const agentTypes = useMemo(
    () => [...new Set(enabledAgents.map((a) => (a.config as Record<string, unknown>)?.type as string).filter(Boolean))],
    [enabledAgents]
  )

  const handleToggleRestricted = (restricted: boolean) => {
    onChange(restricted ? [] : null)
  }

  const handleAddRule = () => {
    onChange([...(value ?? []), { type: 'user' }])
  }

  const handleRemoveRule = (index: number) => {
    const next = (value ?? []).filter((_, i) => i !== index)
    onChange(next)
  }

  const handleUpdateRule = (index: number, rule: AllowedInvoker) => {
    const next = (value ?? []).map((r, i) => (i === index ? rule : r))
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="flex items-center gap-2">
            <Shield className="size-4" />
            Invoker Restrictions
          </Label>
          <p className="text-xs text-muted-foreground">
            {isRestricted
              ? 'Only matching invokers can fire this trigger'
              : 'Any actor can fire this trigger'}
          </p>
        </div>
        <Switch
          checked={isRestricted}
          onCheckedChange={handleToggleRestricted}
          disabled={disabled}
          aria-label="Toggle invoker restrictions"
        />
      </div>

      {isRestricted && (
        <div className="space-y-2 pl-2 border-l-2 border-muted">
          {(value ?? []).map((rule, index) => (
            <InvokerRuleRow
              key={index}
              rule={rule}
              onChange={(r) => handleUpdateRule(index, r)}
              onRemove={() => handleRemoveRule(index)}
              disabled={disabled}
              agents={enabledAgents}
              profileMap={profileMap}
              agentTypes={agentTypes}
            />
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddRule}
            disabled={disabled}
            className="w-full"
          >
            <Plus className="size-4 mr-2" />
            Add Rule
          </Button>

          {value?.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No rules defined — no one can fire this trigger
            </p>
          )}
        </div>
      )}
    </div>
  )
}

interface InvokerRuleRowProps {
  rule: AllowedInvoker
  onChange: (rule: AllowedInvoker) => void
  onRemove: () => void
  disabled?: boolean
  agents: Agent[]
  profileMap: Map<string, Profile>
  agentTypes: string[]
}

function InvokerRuleRow({ rule, onChange, onRemove, disabled, agents, profileMap, agentTypes }: InvokerRuleRowProps) {
  const handleTypeChange = (newType: string) => {
    switch (newType) {
      case 'any':
        onChange({ type: 'any' })
        break
      case 'user':
        onChange({ type: 'user' })
        break
      case 'system':
        onChange({ type: 'system' })
        break
      case 'agent':
        onChange({ type: 'agent' })
        break
    }
  }

  return (
    <div className="flex items-start gap-2 p-2 rounded border bg-background">
      <Select value={rule.type} onValueChange={handleTypeChange} disabled={disabled}>
        <SelectTrigger className="w-[140px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INVOKER_TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {rule.type === 'agent' && (
        <div className="flex flex-1 flex-col gap-2">
          <AgentIdPicker
            value={rule.agent_id ?? null}
            onChange={(agentId) =>
              onChange({
                type: 'agent',
                agent_id: agentId ?? undefined,
                agent_type: rule.agent_type,
              })
            }
            agents={agents}
            profileMap={profileMap}
            disabled={disabled}
          />
          <Select
            value={rule.agent_type ?? '__any__'}
            onValueChange={(v) =>
              onChange({
                type: 'agent',
                agent_id: rule.agent_id,
                agent_type: v === '__any__' ? undefined : v,
              })
            }
            disabled={disabled}
          >
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Any type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Any type</SelectItem>
              {agentTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled}
        className="shrink-0"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}

interface AgentIdPickerProps {
  value: string | null
  onChange: (agentId: string | null) => void
  agents: Agent[]
  profileMap: Map<string, Profile>
  disabled?: boolean
}

function AgentIdPicker({ value, onChange, agents, profileMap, disabled }: AgentIdPickerProps) {
  const [open, setOpen] = useState(false)

  const selectedProfile = value ? profileMap.get(value) ?? null : null
  const displayName = selectedProfile?.name ?? (value ? `${value.slice(0, 8)}...` : 'Any agent')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between text-xs')}
          disabled={disabled}
          size="sm"
          type="button"
        >
          <span className="flex items-center gap-2">
            <Bot className="size-3.5 shrink-0" />
            <span className="truncate">{displayName}</span>
          </span>
          <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search agents..." />
          <CommandList>
            <CommandEmpty>No agents found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__any__"
                onSelect={() => {
                  onChange(null)
                  setOpen(false)
                }}
                className="flex items-center gap-2"
              >
                <span className="flex-1">Any agent</span>
                {value === null && <Check className="size-4 text-primary shrink-0" />}
              </CommandItem>
              {agents.map((agent) => {
                const profile = profileMap.get(agent.id)
                const name = profile?.name ?? agent.id
                return (
                  <CommandItem
                    key={agent.id}
                    value={name}
                    onSelect={() => {
                      onChange(agent.id)
                      setOpen(false)
                    }}
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

function summarizeInvokers(
  invokers: AllowedInvoker[] | null,
  profileMap?: Map<string, Profile>
): string | null {
  if (!invokers || invokers.length === 0) return null

  const labels = invokers.map((rule) => {
    switch (rule.type) {
      case 'any':
        return 'Anyone'
      case 'user':
        return 'Users'
      case 'system':
        return 'System'
      case 'agent': {
        if (rule.agent_type) return `type:${rule.agent_type}`
        if (rule.agent_id) {
          if (profileMap) {
            const profile = profileMap.get(rule.agent_id)
            if (profile) return profile.name
          }
          return `agent:${rule.agent_id.slice(0, 8)}…`
        }
        return 'Any agent'
      }
      default:
        return 'Unknown'
    }
  })

  return labels.join(' | ')
}

export { AllowedInvokersEditor, summarizeInvokers }
