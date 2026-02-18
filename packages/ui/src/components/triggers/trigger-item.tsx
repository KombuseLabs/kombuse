'use client'

import { useMemo } from 'react'
import type { AgentTrigger, Label, Profile } from '@kombuse/types'
import { Pencil, Shield, Trash2, Zap } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../../base/button'
import { Switch } from '../../base/switch'
import { getEventTypeOption } from './event-type-constants'
import { getMentionTypeLabel } from './mention-type-picker'
import { getAuthorFilterLabel } from './author-filter-picker'
import { useAgentProfiles } from '../../hooks/use-agents'
import { summarizeInvokers } from './allowed-invokers-editor'

interface TriggerItemProps {
  trigger: AgentTrigger
  labels?: Label[]
  onEdit: () => void
  onDelete: () => void
  onToggle: (enabled: boolean) => void
  isDeleting?: boolean
  isToggling?: boolean
}

function TriggerItem({
  trigger,
  labels,
  onEdit,
  onDelete,
  onToggle,
  isDeleting,
  isToggling,
}: TriggerItemProps) {
  const { data: agentProfiles } = useAgentProfiles()

  const profileMap = useMemo(() => {
    const map = new Map<string, Profile>()
    if (agentProfiles) {
      for (const p of agentProfiles) {
        map.set(p.id, p)
      }
    }
    return map
  }, [agentProfiles])

  const eventOption = getEventTypeOption(trigger.event_type)

  const resolvedLabel = (() => {
    if (!trigger.conditions?.label_id || !labels) return null
    return labels.find((l) => l.id === Number(trigger.conditions!.label_id)) ?? null
  })()

  const conditionSummary = (() => {
    if (!trigger.conditions) return null
    const conditions = trigger.conditions
    if (conditions.mention_type) {
      return getMentionTypeLabel(String(conditions.mention_type))
    }
    if (conditions.author_type) {
      const authorIds = Array.isArray(conditions.author_id) ? (conditions.author_id as string[]) : []
      if (authorIds.length > 0 && agentProfiles) {
        const names = authorIds.map((id) => {
          const profile = agentProfiles.find((p) => p.id === id)
          return profile?.name ?? id.slice(0, 8) + '...'
        })
        return getAuthorFilterLabel(String(conditions.author_type), names)
      }
      return getAuthorFilterLabel(String(conditions.author_type))
    }
    if (conditions.label_id != null) {
      if (resolvedLabel) return resolvedLabel.name
      return `label_id: ${conditions.label_id}`
    }
    const entries = Object.entries(conditions)
    if (entries.length === 0) return null
    const parts = entries.slice(0, 2).map(([key, value]) => {
      if (key.startsWith('exclude_')) {
        return `not ${key.replace('exclude_', '')} = ${value}`
      }
      return `${key} = ${value}`
    })
    if (entries.length > 2) {
      parts.push(`+${entries.length - 2} more`)
    }
    return parts.join(', ')
  })()

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border',
        !trigger.is_enabled && 'opacity-60 bg-muted/50'
      )}
    >
      <Zap
        className={cn(
          'size-4 shrink-0',
          trigger.is_enabled ? 'text-primary' : 'text-muted-foreground'
        )}
      />

      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {eventOption?.label ?? trigger.event_type}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          {conditionSummary && (
            <span className="flex items-center gap-1">
              {resolvedLabel && (
                <span
                  className="inline-block size-2 rounded-full shrink-0"
                  style={{ backgroundColor: resolvedLabel.color }}
                />
              )}
              <span>{conditionSummary}</span>
            </span>
          )}
          {trigger.priority > 0 && <span>Priority: {trigger.priority}</span>}
          {trigger.allowed_invokers && trigger.allowed_invokers.length > 0 && (
            <span className="flex items-center gap-1">
              <Shield className="size-3" />
              <span>{summarizeInvokers(trigger.allowed_invokers, profileMap)}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Switch
          checked={trigger.is_enabled}
          onCheckedChange={onToggle}
          disabled={isToggling}
          aria-label="Toggle trigger"
        />
        <Button variant="ghost" size="icon" onClick={onEdit}>
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          disabled={isDeleting}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}

export { TriggerItem }
export type { TriggerItemProps }
