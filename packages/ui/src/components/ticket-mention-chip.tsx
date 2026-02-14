import { Link } from 'react-router-dom'
import { useTicket } from '../hooks/use-tickets'
import { cn } from '../lib/utils'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../base/hover-card'
import { TicketPreviewCard } from './ticket-preview-card'

interface TicketMentionChipProps {
  ticketId: number
  href: string
  variant?: 'chip' | 'inline'
}

const statusDotColors: Record<string, string> = {
  open: 'bg-green-500',
  in_progress: 'bg-yellow-500',
  blocked: 'bg-red-500',
  closed: 'bg-gray-400',
}

export function TicketMentionChip({ ticketId, href, variant = 'chip' }: TicketMentionChipProps) {
  const { data: ticket, isLoading, isError } = useTicket(ticketId)

  if (isLoading || isError || !ticket) {
    return (
      <Link to={href} className="text-primary no-underline hover:underline">
        #{ticketId}
      </Link>
    )
  }

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        {variant === 'inline' ? (
          <Link to={href} className="font-medium text-primary no-underline hover:underline">
            #{ticket.id}
          </Link>
        ) : (
          <Link
            to={href}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5',
              'bg-muted/50 text-sm no-underline hover:bg-muted transition-colors',
              'align-baseline'
            )}
          >
            <span className="font-mono text-xs text-muted-foreground">#{ticket.id}</span>
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
