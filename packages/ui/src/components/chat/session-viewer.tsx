'use client'

import type { SerializedAgentEvent } from '@kombuse/types'
import { cn } from '../../lib/utils'

interface SessionViewerProps {
  events: SerializedAgentEvent[]
  isLoading?: boolean
  emptyMessage?: string
  className?: string
}

function SessionViewer({ events, isLoading = false, emptyMessage = 'No events yet', className }: SessionViewerProps) {
  if (events.length === 0 && !isLoading) {
    return (
      <div className={cn('flex-1 flex items-center justify-center text-muted-foreground', className)}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={cn('flex-1 overflow-y-auto p-4 space-y-4', className)}>
      {events.map((event) => (
        <div
          key={`${event.type}-${event.timestamp}`}
          className={cn(
            'p-3 rounded-lg text-sm overflow-x-auto',
            event.type === 'message' && 'role' in event && event.role === 'user'
              ? 'bg-primary/10'
              : 'bg-muted'
          )}
        >
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
            <span className="font-medium uppercase">{event.type}</span>
            {event.type === 'message' && 'role' in event && (
              <span className="text-xs">({event.role})</span>
            )}
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(event, null, 2)}
          </pre>
        </div>
      ))}
      {isLoading && (
        <div className="bg-muted p-3 rounded-lg text-sm">
          <span className="animate-pulse">Thinking...</span>
        </div>
      )}
    </div>
  )
}

export { SessionViewer, type SessionViewerProps }
