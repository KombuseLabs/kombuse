'use client'

import type { SerializedAgentToolUseEvent, SerializedAgentToolResultEvent, JsonValue } from '@kombuse/types'
import { EventCard } from './event-card'
import { ExpandablePreview } from '../../expandable-preview'

function formatResultContent(content: string | JsonValue[]): string {
  if (typeof content === 'string') return content

  if (Array.isArray(content)) {
    const texts: string[] = []
    for (const block of content) {
      if (typeof block === 'object' && block !== null && 'type' in block && (block as Record<string, unknown>).type === 'text') {
        const text = (block as Record<string, unknown>).text
        if (typeof text === 'string') {
          texts.push(text)
          continue
        }
      }
      texts.push(JSON.stringify(block, null, 2))
    }
    return texts.join('\n')
  }

  return JSON.stringify(content, null, 2)
}

export interface EnterPlanModeRendererProps {
  toolUse: SerializedAgentToolUseEvent
  result?: SerializedAgentToolResultEvent
}

export function EnterPlanModeRenderer({ toolUse, result }: EnterPlanModeRendererProps) {
  const { timestamp } = toolUse
  const outputContent = result ? formatResultContent(result.content) : null

  const isError = result?.isError ?? false

  return (
    <EventCard
      timestamp={timestamp}
      className={isError ? 'bg-red-500/5 ring-1 ring-red-500/20' : 'bg-muted/40'}
      header={
        <>
          <span className="font-mono text-xs font-medium">EnterPlanMode</span>
          {isError && (
            <span className="text-xs font-medium text-red-600 dark:text-red-400">Failed</span>
          )}
        </>
      }
    >
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
    </EventCard>
  )
}
