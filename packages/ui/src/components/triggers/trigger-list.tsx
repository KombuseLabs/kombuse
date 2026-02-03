'use client'

import type { AgentTrigger } from '@kombuse/types'
import { Zap } from 'lucide-react'
import { TriggerItem } from './trigger-item'

interface TriggerListProps {
  triggers: AgentTrigger[]
  onEdit: (trigger: AgentTrigger) => void
  onDelete: (triggerId: number) => void
  onToggle: (triggerId: number, enabled: boolean) => void
  deletingId?: number
  togglingId?: number
}

function TriggerList({
  triggers,
  onEdit,
  onDelete,
  onToggle,
  deletingId,
  togglingId,
}: TriggerListProps) {
  if (triggers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Zap className="size-8 mb-2" />
        <p className="text-sm">No triggers configured</p>
        <p className="text-xs">Add a trigger to automate this agent</p>
      </div>
    )
  }

  const sortedTriggers = [...triggers].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return (
    <div className="space-y-2">
      {sortedTriggers.map((trigger) => (
        <TriggerItem
          key={trigger.id}
          trigger={trigger}
          onEdit={() => onEdit(trigger)}
          onDelete={() => onDelete(trigger.id)}
          onToggle={(enabled) => onToggle(trigger.id, enabled)}
          isDeleting={deletingId === trigger.id}
          isToggling={togglingId === trigger.id}
        />
      ))}
    </div>
  )
}

export { TriggerList }
export type { TriggerListProps }
