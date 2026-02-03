'use client'

import type { AgentTrigger } from '@kombuse/types'
import { Pencil, Trash2, Zap } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../../base/button'
import { Switch } from '../../base/switch'
import { getEventTypeOption } from './event-type-constants'

interface TriggerItemProps {
  trigger: AgentTrigger
  onEdit: () => void
  onDelete: () => void
  onToggle: (enabled: boolean) => void
  isDeleting?: boolean
  isToggling?: boolean
}

function TriggerItem({
  trigger,
  onEdit,
  onDelete,
  onToggle,
  isDeleting,
  isToggling,
}: TriggerItemProps) {
  const eventOption = getEventTypeOption(trigger.event_type)
  const conditionCount = trigger.conditions ? Object.keys(trigger.conditions).length : 0

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
          {conditionCount > 0 && (
            <span>
              {conditionCount} condition{conditionCount > 1 ? 's' : ''}
            </span>
          )}
          {trigger.priority > 0 && <span>Priority: {trigger.priority}</span>}
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
