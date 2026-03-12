import type { SerializedAgentCompleteEvent } from '@kombuse/types'
import { CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EventCard } from './event-card'

export interface CompleteRendererProps {
  event: SerializedAgentCompleteEvent
}

export function CompleteRenderer({ event }: CompleteRendererProps) {
  const { reason, success, exitCode, errorMessage, resumeFailed, timestamp } = event
  const isSuccess = success !== false

  return (
    <EventCard
      timestamp={timestamp}
      className={cn(
        'border-l-2',
        isSuccess ? 'border-l-green-500 bg-green-500/10' : 'border-l-destructive bg-destructive/10'
      )}
      header={
        <>
          {isSuccess ? (
            <CheckCircle2 className="size-3.5 text-green-600 dark:text-green-400" />
          ) : (
            <XCircle className="size-3.5 text-destructive" />
          )}
          <span
            className={cn(
              'text-xs font-medium',
              isSuccess ? 'text-green-700 dark:text-green-300' : 'text-destructive'
            )}
          >
            {isSuccess ? 'Session Complete' : 'Session Failed'}
          </span>
        </>
      }
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Reason</span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {reason}
          </span>
          {exitCode != null && (
            <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground">
              exit {exitCode}
            </span>
          )}
          {resumeFailed && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              Resume failed
            </span>
          )}
        </div>
        {errorMessage && (
          <p className={cn('text-sm', isSuccess ? 'text-muted-foreground' : 'text-destructive')}>
            {errorMessage}
          </p>
        )}
      </div>
    </EventCard>
  )
}
