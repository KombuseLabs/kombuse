import type { SerializedAgentToolUseEvent, SerializedAgentToolResultEvent, JsonValue } from '@kombuse/types'
import { ExpandablePreview } from '../../expandable-preview'
import { EventCard } from './event-card'
import { formatToolName } from './format-tool-name'

/** Try to parse a string as JSON and pretty-print it; return original on failure. */
function tryPrettyPrint(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

/** Format tool result content, extracting and pretty-printing text blocks. */
function formatResultContent(content: string | JsonValue[]): string {
  if (typeof content === 'string') return tryPrettyPrint(content)

  if (Array.isArray(content)) {
    const texts: string[] = []
    for (const block of content) {
      if (typeof block === 'object' && block !== null && 'type' in block && (block as Record<string, unknown>).type === 'text') {
        const text = (block as Record<string, unknown>).text
        if (typeof text === 'string') {
          texts.push(tryPrettyPrint(text))
          continue
        }
      }
      texts.push(JSON.stringify(block, null, 2))
    }
    return texts.join('\n')
  }

  return JSON.stringify(content, null, 2)
}

export interface ToolResultRendererProps {
  toolUse: SerializedAgentToolUseEvent
  result: SerializedAgentToolResultEvent
}

export function ToolResultRenderer({ toolUse, result }: ToolResultRendererProps) {
  const { name, input, timestamp } = toolUse
  const description = typeof input.description === 'string' ? input.description : null
  const command = typeof input.command === 'string' ? input.command : null

  const inputDisplay = command ?? JSON.stringify(input, null, 2)
  const outputContent = formatResultContent(result.content)

  const isError = result.isError ?? false

  return (
    <EventCard
      timestamp={timestamp}
      className={isError ? 'bg-red-500/5 ring-1 ring-red-500/20' : 'bg-muted/40'}
      header={
        <>
          <span className="font-mono text-xs font-medium">{formatToolName(name)}</span>
          {isError && (
            <span className="text-xs font-medium text-red-600 dark:text-red-400">Error</span>
          )}
          {description && (
            <span className="text-xs text-muted-foreground">{description}</span>
          )}
        </>
      }
    >
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <span className="w-8 shrink-0 pt-1.5 text-right font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            in
          </span>
          <pre className="flex-1 overflow-x-auto whitespace-pre-wrap rounded bg-muted/50 p-2 font-mono text-xs">
            {inputDisplay}
          </pre>
        </div>

        <div className="flex items-start gap-2">
          <span className="w-8 shrink-0 pt-1.5 text-right font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            out
          </span>
          <ExpandablePreview className="flex-1 rounded bg-muted/50 p-2 font-mono text-xs" maxLines={5}>
            {outputContent}
          </ExpandablePreview>
        </div>
      </div>
    </EventCard>
  )
}
