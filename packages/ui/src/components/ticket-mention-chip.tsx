import { Link } from 'react-router-dom'
import { useTicketByNumber } from '../hooks/use-tickets'
import { cn } from '../lib/utils'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../base/hover-card'
import { TicketPreviewCard } from './ticket-preview-card'

type TicketMentionChipProps = {
  ticketNumber: number
  projectId: string
  href?: string
  variant?: 'chip' | 'inline'
}

const statusDotColors: Record<string, string> = {
  open: 'bg-green-500',
  in_progress: 'bg-yellow-500',
  blocked: 'bg-red-500',
  closed: 'bg-gray-400',
}

export function TicketMentionChip(props: TicketMentionChipProps) {
  const { href, variant = 'chip', projectId, ticketNumber } = props
  const { data: ticket, isLoading, isError } = useTicketByNumber(projectId, ticketNumber)
  const displayNumber = ticket?.ticket_number ?? ticketNumber
  const resolvedHref = ticket
    ? (href ?? `/projects/${ticket.project_id}/tickets/${ticket.ticket_number}`)
    : (href ?? '#')

  if (isLoading || isError || !ticket) {
    return (
      <Link to={resolvedHref} className="text-primary no-underline hover:underline">
        #{displayNumber}
      </Link>
    )
  }

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        {variant === 'inline' ? (
          <Link to={resolvedHref} className="font-medium text-primary no-underline hover:underline">
            #{ticket.ticket_number}
          </Link>
        ) : (
          <Link
            to={resolvedHref}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5',
              'bg-muted/50 text-sm no-underline hover:bg-muted transition-colors',
              'align-baseline'
            )}
          >
            <span className="font-mono text-xs text-muted-foreground">#{ticket.ticket_number}</span>
            <span className="max-w-[200px] truncate text-foreground">{ticket.title}</span>
            <span
              className={cn('inline-block h-2 w-2 shrink-0 rounded-full', statusDotColors[ticket.status])}
              title={ticket.status.replace('_', ' ')}
            />
          </Link>
        )}
      </HoverCardTrigger>
      <HoverCardContent>
        <TicketPreviewCard ticket={ticket} />
      </HoverCardContent>
    </HoverCard>
  )
}
