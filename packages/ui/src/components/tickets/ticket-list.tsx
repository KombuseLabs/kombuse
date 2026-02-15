import type { TicketFilters, TicketWithLabels } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { LabelBadge } from '../labels/label-badge'
import { StatusIndicator } from '../status-indicator'
import { useTicketAgentStatus } from '../../hooks'

type TicketSortBy = NonNullable<TicketFilters['sort_by']>

interface TicketListProps {
  tickets: TicketWithLabels[]
  className?: string
  selectedTicketId?: number
  onTicketClick?: (ticket: TicketWithLabels) => void
  sortBy?: TicketSortBy
}

const priorityLabels: Record<number, string> = {
  0: 'Lowest',
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Highest',
}

interface TicketItemProps {
  ticket: TicketWithLabels
  isSelected?: boolean
  onTicketClick?: (ticket: TicketWithLabels) => void
  sortBy: TicketSortBy
}

const sortDateFieldMap: Record<TicketSortBy, 'created_at' | 'updated_at' | 'opened_at' | 'last_activity_at' | 'closed_at'> = {
  created_at: 'created_at',
  updated_at: 'updated_at',
  opened_at: 'opened_at',
  last_activity_at: 'last_activity_at',
  closed_at: 'closed_at',
}

const missingDateLabels: Partial<Record<TicketSortBy, string>> = {
  closed_at: 'Not closed',
}

function getTicketDateLabel(ticket: TicketWithLabels, sortBy: TicketSortBy) {
  const dateField = sortDateFieldMap[sortBy]
  const dateValue = ticket[dateField]

  if (!dateValue) {
    return missingDateLabels[sortBy] ?? 'No date'
  }

  return new Date(dateValue).toLocaleDateString()
}

function TicketItem({ ticket, isSelected, onTicketClick, sortBy }: TicketItemProps) {
  const agentStatus = useTicketAgentStatus(ticket.id)
  const hasUnread = ticket.has_unread === 1

  return (
    <div
      className={cn(
        'group relative px-4 py-3 cursor-pointer transition-colors border-l-2 border-l-transparent',
        isSelected
          ? 'bg-accent border-l-primary'
          : 'hover:bg-accent/50'
      )}
      onClick={() => onTicketClick?.(ticket)}
    >
      {/* Main content */}
      <div className="min-w-0 flex-1">
        {/* Title row */}
        <div className="flex items-center gap-2">
          {hasUnread && (
            <span
              className="size-2 rounded-full bg-primary shrink-0"
              role="status"
              aria-label="Unread activity"
            />
          )}
          {agentStatus !== 'idle' && (
            <StatusIndicator status={agentStatus} />
          )}
          <span className="text-xs text-muted-foreground font-mono">#{ticket.id}</span>
          <span className={cn("text-sm truncate", hasUnread ? "font-semibold" : "font-medium")}>{ticket.title}</span>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {ticket.status.replace('_', ' ')}
          </span>
          {ticket.priority !== null && (
            <span className="text-xs text-muted-foreground">{priorityLabels[ticket.priority]}</span>
          )}
          <span className="text-xs text-muted-foreground">
            {getTicketDateLabel(ticket, sortBy)}
          </span>
          {ticket.labels && ticket.labels.length > 0 && (
            <>
              {ticket.labels.map((label) => (
                <LabelBadge key={label.id} label={label} size="sm" />
              ))}
            </>
          )}
        </div>

        {/* Body preview */}
        {ticket.body && (
          <p className="mt-1 text-xs text-muted-foreground/70 truncate">
            {ticket.body}
          </p>
        )}
      </div>
    </div>
  )
}

function TicketList({ tickets, className, selectedTicketId, onTicketClick, sortBy = 'created_at' }: TicketListProps) {
  if (tickets.length === 0) {
    return (
      <div className={cn('text-center py-8 text-muted-foreground', className)}>
        No tickets found
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border divide-y', className)}>
      {tickets.map((ticket) => (
        <TicketItem
          key={ticket.id}
          ticket={ticket}
          isSelected={ticket.id === selectedTicketId}
          onTicketClick={onTicketClick}
          sortBy={sortBy}
        />
      ))}
    </div>
  )
}

export { TicketList }
