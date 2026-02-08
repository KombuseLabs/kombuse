import type { SerializedAgentToolUseEvent, SerializedAgentToolResultEvent } from '@kombuse/types'
import { ExpandablePreview } from '../../expandable-preview'
import { EventCard } from './event-card'

export interface ToolResultRendererProps {
  toolUse: SerializedAgentToolUseEvent
  result: SerializedAgentToolResultEvent
}

export function ToolResultRenderer({ toolUse, result }: ToolResultRendererProps) {
  const { name, input, timestamp } = toolUse
  const description = typeof input.description === 'string' ? input.description : null
  const command = typeof input.command === 'string' ? input.command : null

  const inputDisplay = command ?? JSON.stringify(input, null, 2)

  const outputContent = typeof result.content === 'string'
    ? result.content
    : JSON.stringify(result.content, null, 2)

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
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <span className="shrink-0 pt-2 text-xs font-medium text-muted-foreground">IN</span>
          <pre className="flex-1 overflow-x-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-xs">
            {inputDisplay}
          </pre>
        </div>

        <div className="flex items-start gap-2">
          <span className="shrink-0 pt-2 text-xs font-medium text-muted-foreground">OUT</span>
          <ExpandablePreview className="flex-1 rounded bg-background p-2 font-mono text-xs" maxLines={5}>
            {outputContent}
          </ExpandablePreview>
        </div>
      </div>
    </EventCard>
  )
}
