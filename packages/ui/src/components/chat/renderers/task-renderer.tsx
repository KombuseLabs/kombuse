import type { SerializedAgentToolUseEvent, SerializedAgentToolResultEvent, JsonValue } from '@kombuse/types'
import { ExpandablePreview } from '../../expandable-preview'
import { EventCard } from './event-card'

/** Try to parse a string as JSON and pretty-print it; return original on failure. */
function tryPrettyPrint(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

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

export interface TaskRendererProps {
  toolUse: SerializedAgentToolUseEvent
  result?: SerializedAgentToolResultEvent
}

export function TaskRenderer({ toolUse, result }: TaskRendererProps) {
  const { input, timestamp } = toolUse
  const description = typeof input.description === 'string' ? input.description : null
  const prompt = typeof input.prompt === 'string' ? input.prompt : null

  const inputDisplay = prompt ?? JSON.stringify(input, null, 2)
  const outputContent = result ? formatResultContent(result.content) : null

  const isError = result?.isError ?? false

  return (
    <EventCard
      timestamp={timestamp}
      className={isError ? 'bg-red-500/5 ring-1 ring-red-500/20' : 'bg-muted/40'}
      header={
        <span className="text-xs font-medium">
          <span className="text-muted-foreground">Task:</span>{' '}
          {description ?? 'Agent task'}
          {isError && (
            <span className="ml-2 text-red-600 dark:text-red-400">Failed</span>
          )}
        </span>
      }
    >
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <span className="w-8 shrink-0 pt-1.5 text-right font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            in
          </span>
          <ExpandablePreview className="flex-1 rounded bg-muted/50 p-2 font-mono text-xs" maxLines={3}>
            {inputDisplay}
          </ExpandablePreview>
        </div>

        {outputContent && (
          <div className="flex items-start gap-2">
            <span className="w-8 shrink-0 pt-1.5 text-right font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              out
            </span>
            <ExpandablePreview className="flex-1 rounded bg-muted/50 p-2 font-mono text-xs" maxLines={5}>
              {outputContent}
            </ExpandablePreview>
          </div>
        )}
      </div>
    </EventCard>
  )
}
