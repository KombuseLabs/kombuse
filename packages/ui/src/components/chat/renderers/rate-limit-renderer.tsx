import type { SerializedAgentRawEvent } from '@kombuse/types'
import { AlertTriangle } from 'lucide-react'
import { EventCard } from './event-card'

export interface RateLimitRendererProps {
  event: SerializedAgentRawEvent
}

export function RateLimitRenderer({ event }: RateLimitRendererProps) {
  const { timestamp, data } = event
  const d = data as Record<string, unknown> | null

  const message = d?.message as string | undefined
  const retryAfter = d?.retry_after as number | undefined

  return (
    <EventCard
      timestamp={timestamp}
      className="border-l-2 border-l-amber-500 bg-amber-500/10"
      header={
        <>
          <AlertTriangle className="size-3.5 text-amber-500" />
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Rate limited</span>
        </>
      }
    >
      <div className="space-y-1">
        {message && <p className="text-sm">{message}</p>}
        {retryAfter != null && (
          <p className="text-xs text-muted-foreground">
            Retry after {retryAfter}s
          </p>
        )}
      </div>
    </EventCard>
  )
}
