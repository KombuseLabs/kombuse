import type { EventWithActor } from '@kombuse/types'
import { parseSessionId } from '@kombuse/types'
import { Link } from 'react-router-dom'
import { Tooltip, TooltipTrigger, TooltipContent } from '../../base/tooltip'
import { cn } from '../../lib/utils'
import { useSessionByKombuseId } from '../../hooks/use-sessions'
import { TicketMentionChip } from '../ticket-mention-chip'
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
  Zap,
  type LucideIcon,
} from 'lucide-react'

interface TimelineEventItemProps {
  event: EventWithActor
  projectId?: string | null
  onSessionClick?: (sessionId: string) => void
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

function TimelineEventItem({ event, projectId, onSessionClick, className }: TimelineEventItemProps) {
  const config = eventConfig[event.event_type] || {
    icon: Plus,
    label: event.event_type,
  }
  const Icon = config.icon

  const actorLabel = event.actor?.name || event.actor_id || event.actor_type

  // Parse payload for richer event labels
  let eventLabel = config.label
  let eventSuffix: React.ReactNode = null

  if (event.event_type === 'label.added' || event.event_type === 'label.removed') {
    try {
      const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload
      if (payload?.label_name) {
        const action = event.event_type === 'label.added' ? 'added' : 'removed'
        eventLabel = `${action} label ${payload.label_name}`
      }
    } catch {
      // Fall back to default label
    }
  }

  if (event.event_type === 'mention.created') {
    try {
      const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload
      if (payload?.mention_type === 'ticket_cross_reference' && payload?.source_ticket_id) {
        const ticketHref = projectId
          ? `/projects/${projectId}/tickets/${payload.source_ticket_id}`
          : `/tickets/${payload.source_ticket_id}`
        eventLabel = 'mentioned this ticket in'
        eventSuffix = (
          <TicketMentionChip ticketId={payload.source_ticket_id} href={ticketHref} />
        )
      } else if (payload?.mention_type === 'ticket' && payload?.mentioned_ticket_id) {
        const ticketHref = projectId
          ? `/projects/${projectId}/tickets/${payload.mentioned_ticket_id}`
          : `/tickets/${payload.mentioned_ticket_id}`
        eventLabel = 'mentioned'
        eventSuffix = (
          <TicketMentionChip ticketId={payload.mentioned_ticket_id} href={ticketHref} />
        )
      } else if (payload?.mention_type === 'profile' && payload?.mention_text) {
        eventLabel = `mentioned ${payload.mention_text}`
      }
    } catch {
      // Fall back to default label
    }
  }

  const { data: linkedSession } = useSessionByKombuseId(event.kombuse_session_id)

  const sessionUrl = linkedSession
    ? projectId && (linkedSession.ticket_id || event.ticket_id)
      ? `/projects/${projectId}/tickets/${linkedSession.ticket_id || event.ticket_id}?session=${linkedSession.kombuse_session_id}`
      : projectId
        ? `/projects/${projectId}/chats/${linkedSession.kombuse_session_id}`
        : `/chats/${linkedSession.kombuse_session_id}`
    : null

  const sessionOrigin = event.kombuse_session_id
    ? parseSessionId(event.kombuse_session_id)?.origin ?? null
    : null

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 py-1 px-3 ml-6 text-xs text-muted-foreground',
        className
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span>
        <span className="font-medium text-foreground">{actorLabel}</span>
        {sessionUrl && linkedSession ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                {onSessionClick ? (
                  <button
                    type="button"
                    onClick={() => onSessionClick(linkedSession.kombuse_session_id!)}
                    className="inline-flex items-center gap-1 ml-1 text-muted-foreground hover:text-foreground transition-colors align-middle"
                  >
                    {sessionOrigin === 'trigger' ? (
                      <Zap className="size-3" />
                    ) : (
                      <MessageSquare className="size-3" />
                    )}
                    {' '}{eventLabel}
                  </button>
                ) : (
                  <Link
                    to={sessionUrl}
                    className="inline-flex items-center gap-1 ml-1 text-muted-foreground hover:text-foreground transition-colors align-middle"
                  >
                    {sessionOrigin === 'trigger' ? (
                      <Zap className="size-3" />
                    ) : (
                      <MessageSquare className="size-3" />
                    )}
                    {' '}{eventLabel}
                  </Link>
                )}
              </TooltipTrigger>
              <TooltipContent>View session</TooltipContent>
            </Tooltip>
            {eventSuffix}
          </>
        ) : (
          <>
            {' '}{eventLabel}{eventSuffix}
          </>
        )}
      </span>
      <span className="text-xs">
        {new Date(event.created_at).toLocaleString()}
      </span>
    </div>
  )
}

export { TimelineEventItem }
export type { TimelineEventItemProps }
