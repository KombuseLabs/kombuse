import type { EventWithActor, ActorType } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { Badge } from '../../base/badge'
import { Link } from 'react-router-dom'
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
  'ticket.created': {
    icon: Plus,
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    label: 'Ticket Created',
  },
  'ticket.updated': {
    icon: Pencil,
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    label: 'Ticket Updated',
  },
  'ticket.closed': {
    icon: CheckCircle,
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    label: 'Ticket Closed',
  },
  'ticket.reopened': {
    icon: RotateCcw,
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    label: 'Ticket Reopened',
  },
  'ticket.claimed': {
    icon: UserPlus,
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    label: 'Ticket Claimed',
  },
  'ticket.unclaimed': {
    icon: UserMinus,
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    label: 'Ticket Unclaimed',
  },
  'comment.added': {
    icon: MessageSquare,
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    label: 'Comment Added',
  },
  'comment.edited': {
    icon: Pencil,
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    label: 'Comment Edited',
  },
  'label.added': {
    icon: Tag,
    color: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300',
    label: 'Label Added',
  },
  'label.removed': {
    icon: X,
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    label: 'Label Removed',
  },
  'mention.created': {
    icon: AtSign,
    color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
    label: 'Mention Created',
  },
  'agent.started': {
    icon: Play,
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    label: 'Agent Started',
  },
  'agent.completed': {
    icon: CheckCircle2,
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    label: 'Agent Completed',
  },
  'agent.failed': {
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
            {event.actor?.name || event.actor_id || actorConfig.label}
          </Badge>

          {event.ticket_id && event.project_id && (
            <Link
              to={`/projects/${event.project_id}/tickets/${event.ticket_id}`}
              className="text-xs text-primary hover:underline"
            >
              Ticket #{event.ticket_id}
            </Link>
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
