import type { SerializedAgentToolUseEvent } from '@kombuse/types'
import { EventCard } from './event-card'
import { formatToolName } from './format-tool-name'

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
      className="bg-muted/40"
      header={
        <>
          <span className="font-mono text-xs font-medium">{formatToolName(name)}</span>
          {description && (
            <span className="text-xs text-muted-foreground">{description}</span>
          )}
        </>
      }
    >
      <div className="flex items-start gap-2">
        <span className="w-8 shrink-0 pt-1.5 text-right font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          in
        </span>
        <pre className="flex-1 overflow-x-auto whitespace-pre-wrap rounded bg-muted/50 p-2 font-mono text-xs">
          {inputDisplay}
        </pre>
      </div>
    </EventCard>
  )
}
