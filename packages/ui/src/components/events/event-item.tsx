import type { EventWithActor, ActorType } from '@kombuse/types'
import { EVENT_TYPES } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { Badge } from '../../base/badge'
import { AgentHoverCard } from '../agents'
import { TicketMentionChip } from '../ticket-mention-chip'
import {
  Ticket,
  MessageSquare,
  Tag,
  User,
  Bot,
  Settings,
  Plus,
  Pencil,
  X,
  CheckCircle,
  CheckCircle2,
  RotateCcw,
  UserPlus,
  UserMinus,
  AtSign,
  Play,
  XCircle,
} from 'lucide-react'

interface EventItemProps {
  event: EventWithActor
  className?: string
}

const eventTypeConfig: Record<
  string,
  { icon: typeof Ticket; color: string; label: string }
> = {
  [EVENT_TYPES.TICKET_CREATED]: {
    icon: Plus,
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    label: 'Ticket Created',
  },
  [EVENT_TYPES.TICKET_UPDATED]: {
    icon: Pencil,
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    label: 'Ticket Updated',
  },
  [EVENT_TYPES.TICKET_CLOSED]: {
    icon: CheckCircle,
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    label: 'Ticket Closed',
  },
  [EVENT_TYPES.TICKET_REOPENED]: {
    icon: RotateCcw,
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    label: 'Ticket Reopened',
  },
  [EVENT_TYPES.TICKET_CLAIMED]: {
    icon: UserPlus,
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    label: 'Ticket Claimed',
  },
  [EVENT_TYPES.TICKET_UNCLAIMED]: {
    icon: UserMinus,
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    label: 'Ticket Unclaimed',
  },
  [EVENT_TYPES.COMMENT_ADDED]: {
    icon: MessageSquare,
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    label: 'Comment Added',
  },
  [EVENT_TYPES.COMMENT_EDITED]: {
    icon: Pencil,
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    label: 'Comment Edited',
  },
  [EVENT_TYPES.LABEL_ADDED]: {
    icon: Tag,
    color: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300',
    label: 'Label Added',
  },
  [EVENT_TYPES.LABEL_REMOVED]: {
    icon: X,
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    label: 'Label Removed',
  },
  [EVENT_TYPES.MENTION_CREATED]: {
    icon: AtSign,
    color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
    label: 'Mention Created',
  },
  [EVENT_TYPES.AGENT_STARTED]: {
    icon: Play,
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    label: 'Agent Started',
  },
  [EVENT_TYPES.AGENT_COMPLETED]: {
    icon: CheckCircle2,
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    label: 'Agent Completed',
  },
  [EVENT_TYPES.AGENT_FAILED]: {
    icon: XCircle,
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    label: 'Agent Failed',
  },
}

const actorTypeConfig: Record<ActorType, { icon: typeof User; label: string }> = {
  user: { icon: User, label: 'User' },
  agent: { icon: Bot, label: 'Agent' },
  system: { icon: Settings, label: 'System' },
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function EventItem({ event, className }: EventItemProps) {
  const typeConfig = eventTypeConfig[event.event_type] || {
    icon: Ticket,
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    label: event.event_type,
  }
  const actorConfig = actorTypeConfig[event.actor_type]
  const Icon = typeConfig.icon
  const ActorIcon = actorConfig.icon
  const actorLabel = event.actor?.name || event.actor_id || actorConfig.label

  const payload =
    typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors',
        className
      )}
    >
      <div
        className={cn(
          'size-8 rounded-full flex items-center justify-center shrink-0',
          typeConfig.color
        )}
      >
        <Icon className="size-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{typeConfig.label}</span>

          <Badge variant="outline" className="text-xs gap-1">
            <ActorIcon className="size-3" />
            {event.actor_type === 'agent' && event.actor_id ? (
              <AgentHoverCard agentId={event.actor_id}>
                <span>{actorLabel}</span>
              </AgentHoverCard>
            ) : (
              actorLabel
            )}
          </Badge>

          {event.ticket_id && event.project_id && event.ticket_number && (
            <TicketMentionChip
              variant="inline"
              projectId={event.project_id}
              ticketNumber={event.ticket_number}
            />
          )}

          {event.project_id && !event.ticket_id && (
            <span className="text-xs text-muted-foreground">
              Project: {event.project_id}
            </span>
          )}
        </div>

        {payload && Object.keys(payload).length > 0 && (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {JSON.stringify(payload).slice(0, 100)}
            {JSON.stringify(payload).length > 100 && '...'}
          </p>
        )}
      </div>

      <div className="text-xs text-muted-foreground shrink-0 text-right">
        <div>{formatRelativeTime(event.created_at)}</div>
        <div className="text-[10px]">
          {new Date(event.created_at).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}

export { EventItem }
export type { EventItemProps }
