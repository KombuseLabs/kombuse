import type { SerializedAgentToolUseEvent } from '@kombuse/types'
import { EventCard } from './event-card'

export interface ToolUseRendererProps {
  event: SerializedAgentToolUseEvent
}

export function ToolUseRenderer({ event }: ToolUseRendererProps) {
  const { name, input, timestamp } = event
  const description = typeof input.description === 'string' ? input.description : null
  const command = typeof input.command === 'string' ? input.command : null

  const inputDisplay = command ?? JSON.stringify(input, null, 2)

  return (
    <EventCard
      timestamp={timestamp}
      className="bg-muted"
      header={
        <>
          <span className="font-medium">{name}</span>
          {description && (
            <span className="text-muted-foreground">{description}</span>
          )}
        </>
      }
    >
      <div className="flex items-start gap-2">
        <span className="shrink-0 pt-2 text-xs font-medium text-muted-foreground">IN</span>
        <pre className="flex-1 overflow-x-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-xs">
          {inputDisplay}
        </pre>
      </div>
    </EventCard>
  )
}
