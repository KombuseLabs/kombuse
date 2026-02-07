import type { EventWithActor } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { EventItem } from './event-item'

interface EventListProps {
  events: EventWithActor[]
  className?: string
  emptyMessage?: string
}

function EventList({
  events,
  className,
  emptyMessage = 'No events found',
}: EventListProps) {
  if (events.length === 0) {
    return (
      <div className={cn('text-center py-8 text-muted-foreground', className)}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={cn('divide-y', className)}>
      {events.map((event) => (
        <EventItem key={event.id} event={event} />
      ))}
    </div>
  )
}

export { EventList }
export type { EventListProps }
