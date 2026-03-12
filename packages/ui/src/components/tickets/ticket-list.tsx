import type { ReactNode } from 'react'
import type { TicketFilters, TicketWithLabels } from '@kombuse/types'
import { cn } from '@/lib/utils'
import { LabelBadge } from '../labels/label-badge'
import { StatusIndicator } from '../status-indicator'
import { useTicketAgentStatus } from '@/hooks'

type TicketSortBy = NonNullable<TicketFilters['sort_by']>
type DateSortBy = Exclude<TicketSortBy, 'priority'>

interface TicketListProps {
  tickets: TicketWithLabels[]
  className?: string
  header?: ReactNode
  emptyMessage?: ReactNode
  selectedTicketNumber?: number
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

const sortDateFieldMap: Record<DateSortBy, 'created_at' | 'updated_at' | 'opened_at' | 'last_activity_at' | 'closed_at'> = {
  created_at: 'created_at',
  updated_at: 'updated_at',
  opened_at: 'opened_at',
  last_activity_at: 'last_activity_at',
  closed_at: 'closed_at',
}

const missingDateLabels: Partial<Record<DateSortBy, string>> = {
  closed_at: 'Not closed',
}

const sortDateLabelPrefixes: Record<DateSortBy, string> = {
  created_at: 'Created',
  updated_at: 'Updated',
  opened_at: 'Opened',
  last_activity_at: 'Activity',
  closed_at: 'Closed',
}

function formatDateTime(dateValue: string): string {
  return new Date(dateValue).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getTicketDateLabel(ticket: TicketWithLabels, sortBy: TicketSortBy) {
  if (sortBy === 'priority') {
    if (ticket.priority == null) return 'No priority'
    return `Priority: ${priorityLabels[ticket.priority] ?? 'Unknown'}`
  }

  const dateField = sortDateFieldMap[sortBy]
  const dateValue = ticket[dateField]

  if (!dateValue) {
    return missingDateLabels[sortBy] ?? 'No date'
  }

  const prefix = sortDateLabelPrefixes[sortBy]
  return `${prefix}: ${formatDateTime(dateValue)}`
}

function TicketItem({ ticket, isSelected, onTicketClick, sortBy }: TicketItemProps) {
  const agentStatus = useTicketAgentStatus(ticket.ticket_number)
  const hasUnread = ticket.has_unread === 1

  return (
    <div
      data-testid={`ticket-item-${ticket.id}`}
      className={cn(
        'group relative cursor-pointer rounded-xl px-3 py-3 transition-colors',
        isSelected
          ? 'bg-accent/70 shadow-sm ring-1 ring-primary/35'
          : 'hover:bg-accent/35'
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
          <span className="text-xs text-muted-foreground font-mono">#{ticket.ticket_number}</span>
          <span className={cn(
            "text-sm truncate",
            hasUnread || isSelected ? "font-semibold" : "font-medium",
          )}
          >
            {ticket.title}
          </span>
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

function TicketList({
  tickets,
  className,
  header,
  emptyMessage = 'No tickets found',
  selectedTicketNumber,
  onTicketClick,
  sortBy = 'created_at',
}: TicketListProps) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm',
        className,
      )}
      data-testid="ticket-list-shell"
    >
      {header ? (
        <div className="shrink-0 border-b" data-testid="ticket-list-header">
          {header}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="ticket-list-viewport">
        {tickets.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <div className="space-y-1">
            {tickets.map((ticket) => (
              <TicketItem
                key={ticket.id}
                ticket={ticket}
                isSelected={ticket.ticket_number === selectedTicketNumber}
                onTicketClick={onTicketClick}
                sortBy={sortBy}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export { TicketList }
