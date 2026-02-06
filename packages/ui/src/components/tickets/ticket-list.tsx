import type { TicketWithLabels } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '../../base/card'
import { LabelBadge } from '../labels/label-badge'

interface TicketListProps {
  tickets: TicketWithLabels[]
  className?: string
  onTicketClick?: (ticket: TicketWithLabels) => void
}

const statusColors: Record<string, string> = {
  open: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  in_progress:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  closed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
}

const priorityLabels: Record<number, string> = {
  0: 'Lowest',
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Highest',
}

function TicketList({ tickets, className, onTicketClick }: TicketListProps) {
  if (tickets.length === 0) {
    return (
      <div className={cn('text-center py-8 text-muted-foreground', className)}>
        No tickets found
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {tickets.map((ticket) => (
        <Card
          key={ticket.id}
          className={cn(
            'cursor-pointer hover:border-primary/50 transition-colors',
            onTicketClick && 'hover:shadow-md'
          )}
          onClick={() => onTicketClick?.(ticket)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">
                {ticket.title}
              </CardTitle>
              <span
                className={cn(
                  'px-2 py-1 text-xs rounded-full font-medium',
                  statusColors[ticket.status]
                )}
              >
                {ticket.status.replace('_', ' ')}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>#{ticket.id}</span>
              {ticket.priority !== null && (
                <span>Priority: {priorityLabels[ticket.priority]}</span>
              )}
              {ticket.project_id && <span>Project: {ticket.project_id}</span>}
              <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
            </div>
            {ticket.labels && ticket.labels.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {ticket.labels.map((label) => (
                  <LabelBadge key={label.id} label={label} size="sm" />
                ))}
              </div>
            )}
            {ticket.body && (
              <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                {ticket.body}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export { TicketList }
