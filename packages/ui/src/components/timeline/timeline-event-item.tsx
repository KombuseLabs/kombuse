import type { Event } from '@kombuse/types'
import { cn } from '../../lib/utils'
import {
  Tag,
  Plus,
  Pencil,
  X,
  CheckCircle,
  RotateCcw,
  UserPlus,
  UserMinus,
  Play,
  CheckCircle2,
  XCircle,
  MessageSquare,
  AtSign,
  type LucideIcon,
} from 'lucide-react'

interface TimelineEventItemProps {
  event: Event
  className?: string
}

const eventConfig: Record<string, { icon: LucideIcon; label: string }> = {
  'ticket.created': { icon: Plus, label: 'created this ticket' },
  'ticket.updated': { icon: Pencil, label: 'updated this ticket' },
  'ticket.closed': { icon: CheckCircle, label: 'closed this ticket' },
  'ticket.reopened': { icon: RotateCcw, label: 'reopened this ticket' },
  'ticket.claimed': { icon: UserPlus, label: 'claimed this ticket' },
  'ticket.unclaimed': { icon: UserMinus, label: 'unclaimed this ticket' },
  'comment.added': { icon: MessageSquare, label: 'added a comment' },
  'comment.edited': { icon: Pencil, label: 'edited a comment' },
  'label.added': { icon: Tag, label: 'added a label' },
  'label.removed': { icon: X, label: 'removed a label' },
  'mention.created': { icon: AtSign, label: 'mentioned someone' },
  'agent.started': { icon: Play, label: 'started processing' },
  'agent.completed': { icon: CheckCircle2, label: 'completed processing' },
  'agent.failed': { icon: XCircle, label: 'failed to process' },
}

function TimelineEventItem({ event, className }: TimelineEventItemProps) {
  const config = eventConfig[event.event_type] || {
    icon: Plus,
    label: event.event_type,
  }
  const Icon = config.icon

  const actorLabel = event.actor_id || event.actor_type

  return (
    <div
      className={cn(
        'flex items-center gap-2 py-2 px-3 text-sm text-muted-foreground',
        className
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span>
        <span className="font-medium text-foreground">{actorLabel}</span>
        {' '}{config.label}
      </span>
      <span className="text-xs">
        {new Date(event.created_at).toLocaleString()}
      </span>
    </div>
  )
}

export { TimelineEventItem }
export type { TimelineEventItemProps }
