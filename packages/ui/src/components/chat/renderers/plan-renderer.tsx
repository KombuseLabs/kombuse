import type { SerializedAgentToolUseEvent, SerializedAgentToolResultEvent, JsonValue } from '@kombuse/types'
import { Markdown } from '../../markdown'
import { useCurrentProject } from '../../../hooks/use-app-context'
import { formatEventTime } from './event-card'

function extractTextContent(content: string | JsonValue[]): string {
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
    }
    return texts.join('\n')
  }

  return ''
}

function extractPlanContent(raw: string): string {
  const marker = '## Approved Plan:\n'
  const idx = raw.indexOf(marker)
  if (idx !== -1) return raw.slice(idx + marker.length).trim()
  return raw
}

export interface PlanRendererProps {
  toolUse: SerializedAgentToolUseEvent
  result?: SerializedAgentToolResultEvent
}

export function PlanRenderer({ toolUse, result }: PlanRendererProps) {
  const { timestamp } = toolUse
  const { currentProjectId } = useCurrentProject()

  const rawText = result ? extractTextContent(result.content) : ''
  const planContent = extractPlanContent(rawText)

  return (
    <div className="rounded-lg border border-border bg-background p-4 text-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Claude's Plan
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {formatEventTime(timestamp)}
        </span>
      </div>
      {planContent ? (
        <Markdown projectId={currentProjectId}>{planContent}</Markdown>
      ) : (
        <p className="text-xs text-muted-foreground italic">Plan pending approval...</p>
      )}
    </div>
  )
}
