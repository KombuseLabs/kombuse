import type { SerializedAgentMessageEvent } from '@kombuse/types'
import { cn } from '../../../lib/utils'
import { Markdown } from '../../markdown'
import { useCurrentProject } from '../../../hooks/use-app-context'

export interface MessageRendererProps {
  event: SerializedAgentMessageEvent
}

export function MessageRenderer({ event }: MessageRendererProps) {
  const { role, content } = event
  const { currentProjectId } = useCurrentProject()

  return (
    <div
      className={cn(
        'rounded-lg p-4',
        role === 'user' && 'bg-primary/10',
        role === 'assistant' && 'bg-muted',
        role === 'system' && 'bg-muted/50 italic'
      )}
    >
      <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
        {role}
      </div>
      <Markdown projectId={currentProjectId}>{content}</Markdown>
    </div>
  )
}
