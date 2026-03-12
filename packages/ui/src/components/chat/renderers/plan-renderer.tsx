import type { SerializedAgentToolUseEvent, SerializedAgentToolResultEvent, JsonValue } from '@kombuse/types'
import { Markdown } from '../../markdown'
import { useCurrentProject } from '@/hooks/use-app-context'
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

  const isError = result?.isError ?? false
  const hasResult = !!result
  const rawText = result ? extractTextContent(result.content) : ''
  const planContent = extractPlanContent(rawText)
  const isApproved = hasResult && !isError && planContent.length > 0
  const isRejected = hasResult && isError

  return (
    <div className={`rounded-lg border bg-background p-4 text-sm ${
      isRejected ? 'border-red-500/30 bg-red-500/5'
      : isApproved ? 'border-green-500/30 bg-green-500/5'
      : 'border-border'
    }`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {isRejected ? "Plan rejected" : isApproved ? "Approved Plan" : "Claude's Plan"}
          </span>
          {isApproved && (
            <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-300">
              Approved
            </span>
          )}
          {isRejected && (
            <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-300">
              Rejected
            </span>
          )}
          {!hasResult && (
            <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">
              Pending
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {formatEventTime(timestamp)}
        </span>
      </div>
      {planContent ? (
        <Markdown projectId={currentProjectId}>{planContent}</Markdown>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          {!hasResult ? 'Plan pending approval...' : 'No plan content available.'}
        </p>
      )}
    </div>
  )
}
