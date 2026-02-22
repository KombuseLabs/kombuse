import type { TicketWithRelations } from '@kombuse/types'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '../lib/utils'
import { statusColors } from '../lib/ticket-utils'
import { LabelBadge } from './labels/label-badge'

const priorityLabels: Record<number, string> = {
  0: 'Lowest',
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Highest',
}

export function TicketPreviewCard({ ticket }: { ticket: TicketWithRelations }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <span className="font-mono text-xs text-muted-foreground shrink-0">#{ticket.ticket_number}</span>
        <span className="font-semibold text-sm leading-snug">{ticket.title}</span>
      </div>

      {ticket.body ? (
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
          {ticket.body}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground italic">No description</p>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
            statusColors[ticket.status]
          )}
        >
          {ticket.status.replace('_', ' ')}
        </span>
        {ticket.priority !== null && ticket.priority !== undefined && (
          <span className="text-xs text-muted-foreground">{priorityLabels[ticket.priority]}</span>
        )}
      </div>

      {ticket.labels.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {ticket.labels.map((label) => (
            <LabelBadge key={label.id} label={label} size="sm" />
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
      </div>
    </div>
  )
}
