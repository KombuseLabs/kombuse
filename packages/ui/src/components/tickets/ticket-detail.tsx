import type { Ticket } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '../../base/card'
import { Button } from '../../base/button'
import { X, Trash2 } from 'lucide-react'

interface TicketDetailProps {
  ticket: Ticket
  className?: string
  onClose?: () => void
  onDelete?: (ticket: Ticket) => void
  isDeleting?: boolean
}

const statusColors: Record<string, string> = {
  open: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  in_progress:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  blocked: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  closed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
}

const priorityLabels: Record<number, string> = {
  0: 'Lowest',
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Highest',
}

function TicketDetail({
  ticket,
  className,
  onClose,
  onDelete,
  isDeleting,
}: TicketDetailProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-muted-foreground">#{ticket.id}</span>
              <span
                className={cn(
                  'px-2 py-1 text-xs rounded-full font-medium',
                  statusColors[ticket.status]
                )}
              >
                {ticket.status.replace('_', ' ')}
              </span>
            </div>
            <CardTitle className="text-xl">{ticket.title}</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(ticket)}
                disabled={isDeleting}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-4" />
              </Button>
            )}
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          {ticket.priority !== null && (
            <div>
              <span className="text-muted-foreground">Priority:</span>{' '}
              <span className="font-medium">{priorityLabels[ticket.priority]}</span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Created:</span>{' '}
            <span className="font-medium">
              {new Date(ticket.created_at).toLocaleDateString()}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Updated:</span>{' '}
            <span className="font-medium">
              {new Date(ticket.updated_at).toLocaleDateString()}
            </span>
          </div>
          {ticket.assignee_id && (
            <div>
              <span className="text-muted-foreground">Assignee:</span>{' '}
              <span className="font-medium">{ticket.assignee_id}</span>
            </div>
          )}
        </div>

        {ticket.body && (
          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Description</h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {ticket.body}
            </p>
          </div>
        )}

        {ticket.external_url && (
          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">External Link</h4>
            <a
              href={ticket.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              {ticket.external_url}
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export { TicketDetail }
