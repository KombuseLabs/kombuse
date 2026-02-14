import type { SerializedAgentErrorEvent } from '@kombuse/types'
import { AlertTriangle } from 'lucide-react'
import { EventCard } from './event-card'

export interface ErrorRendererProps {
  event: SerializedAgentErrorEvent
}

function formatStackTrace(stack: string): string {
  return stack.replace(/\\n/g, '\n')
}

export function ErrorRenderer({ event }: ErrorRendererProps) {
  const { message, error, timestamp } = event
  const name = error?.name ?? 'Error'
  const secondaryMessage = error?.message && error.message !== message ? error.message : null
  const stack = error?.stack ? formatStackTrace(error.stack) : null

  return (
    <EventCard
      timestamp={timestamp}
      className="border-l-2 border-l-destructive bg-destructive/10"
      header={
        <>
          <AlertTriangle className="size-3.5 text-destructive" />
          <span className="text-xs font-medium text-destructive">
            {name}
          </span>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-sm font-medium">{message}</p>
        {secondaryMessage && (
          <p className="text-xs text-muted-foreground">{secondaryMessage}</p>
        )}
        {stack && (
          <pre className="max-h-60 overflow-y-auto overflow-x-auto whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono text-xs text-muted-foreground">
            {stack}
          </pre>
        )}
      </div>
    </EventCard>
  )
}
