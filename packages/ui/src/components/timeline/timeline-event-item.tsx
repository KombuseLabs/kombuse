import type { EventWithActor } from '@kombuse/types'
import { EVENT_TYPES, parseSessionId } from '@kombuse/types'
import { Link } from 'react-router-dom'
import { Button } from '@/base/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/base/tooltip'
import { cn } from '@/lib/utils'
import { useSessionByKombuseId } from '@/hooks/use-sessions'
import { TicketMentionChip } from '../ticket-mention-chip'
import { AgentHoverCard } from '../agents'
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
  ticketNumber?: number
  onSessionClick?: (sessionId: string) => void
  isResumable?: boolean
  onResume?: () => void
  onRerun?: () => void
  className?: string
}

const eventConfig: Record<string, { icon: LucideIcon; label: string }> = {
  [EVENT_TYPES.TICKET_CREATED]: { icon: Plus, label: 'created this ticket' },
  [EVENT_TYPES.TICKET_UPDATED]: { icon: Pencil, label: 'updated this ticket' },
  [EVENT_TYPES.TICKET_CLOSED]: { icon: CheckCircle, label: 'closed this ticket' },
  [EVENT_TYPES.TICKET_REOPENED]: { icon: RotateCcw, label: 'reopened this ticket' },
  [EVENT_TYPES.TICKET_CLAIMED]: { icon: UserPlus, label: 'claimed this ticket' },
  [EVENT_TYPES.TICKET_UNCLAIMED]: { icon: UserMinus, label: 'unclaimed this ticket' },
  [EVENT_TYPES.COMMENT_ADDED]: { icon: MessageSquare, label: 'added a comment' },
  [EVENT_TYPES.COMMENT_EDITED]: { icon: Pencil, label: 'edited a comment' },
  [EVENT_TYPES.LABEL_ADDED]: { icon: Tag, label: 'added a label' },
  [EVENT_TYPES.LABEL_REMOVED]: { icon: X, label: 'removed a label' },
  [EVENT_TYPES.MENTION_CREATED]: { icon: AtSign, label: 'mentioned someone' },
  [EVENT_TYPES.AGENT_STARTED]: { icon: Play, label: 'started processing' },
  [EVENT_TYPES.AGENT_COMPLETED]: { icon: CheckCircle2, label: 'completed processing' },
  [EVENT_TYPES.AGENT_FAILED]: { icon: XCircle, label: 'failed to process' },
}

function TimelineEventItem({ event, projectId, ticketNumber, onSessionClick, isResumable, onResume, onRerun, className }: TimelineEventItemProps) {
  const config = eventConfig[event.event_type] || {
    icon: Plus,
    label: event.event_type,
  }
  const Icon = config.icon

  const actorLabel = event.actor?.name || event.actor_id || event.actor_type
  const actorNode =
    event.actor_type === 'agent' && event.actor_id ? (
      <AgentHoverCard agentId={event.actor_id}>
        <span className="font-medium text-foreground">{actorLabel}</span>
      </AgentHoverCard>
    ) : (
      <span className="font-medium text-foreground">{actorLabel}</span>
    )

  // Parse payload for richer event labels
  let eventLabel = config.label
  let eventSuffix: React.ReactNode = null

  if (event.event_type === EVENT_TYPES.LABEL_ADDED || event.event_type === EVENT_TYPES.LABEL_REMOVED) {
    try {
      const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload
      if (payload?.label_name) {
        const action = event.event_type === EVENT_TYPES.LABEL_ADDED ? 'added' : 'removed'
        eventLabel = `${action} label ${payload.label_name}`
      }
    } catch {
      // Fall back to default label
    }
  }

  if (event.event_type === EVENT_TYPES.MENTION_CREATED) {
    try {
      const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload
      if (payload?.mention_type === 'ticket_cross_reference' && payload?.source_ticket_project_id && payload?.source_ticket_number) {
        eventLabel = 'mentioned this ticket in'
        eventSuffix = (
          <>
            {' '}
            <TicketMentionChip
              variant="inline"
              projectId={String(payload.source_ticket_project_id)}
              ticketNumber={Number(payload.source_ticket_number)}
            />
          </>
        )
      } else if (payload?.mention_type === 'ticket' && payload?.mentioned_ticket_project_id && payload?.mentioned_ticket_number) {
        eventLabel = 'mentioned'
        eventSuffix = (
          <>
            {' '}
            <TicketMentionChip
              variant="inline"
              projectId={String(payload.mentioned_ticket_project_id)}
              ticketNumber={Number(payload.mentioned_ticket_number)}
            />
          </>
        )
      } else if (payload?.mention_type === 'profile' && payload?.mention_text) {
        eventLabel = `mentioned ${payload.mention_text}`
      }
    } catch {
      // Fall back to default label
    }
  }

  const { data: linkedSession } = useSessionByKombuseId(event.kombuse_session_id)

  const sessionUrl = linkedSession && projectId
    ? ticketNumber
      ? `/projects/${projectId}/tickets/${ticketNumber}?session=${linkedSession.kombuse_session_id}`
      : `/projects/${projectId}/chats/${linkedSession.kombuse_session_id}`
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
        {actorNode}
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
      {isResumable && (event.event_type === EVENT_TYPES.AGENT_COMPLETED || event.event_type === EVENT_TYPES.AGENT_FAILED) && (
        <span className="inline-flex items-center gap-1 ml-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-5 text-muted-foreground hover:text-foreground"
                onClick={onResume}
              >
                <Play className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Resume agent</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-5 text-muted-foreground hover:text-foreground"
                onClick={onRerun}
              >
                <RotateCcw className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Rerun agent</TooltipContent>
          </Tooltip>
        </span>
      )}
    </div>
  )
}

export { TimelineEventItem }
export type { TimelineEventItemProps }
