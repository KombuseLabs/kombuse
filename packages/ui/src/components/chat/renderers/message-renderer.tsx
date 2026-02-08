import type { SerializedAgentMessageEvent } from '@kombuse/types'
import { cn } from '../../../lib/utils'
import { Markdown } from '../../markdown'
import { useCurrentProject } from '../../../hooks/use-app-context'
import { EventCard } from './event-card'

export interface MessageRendererProps {
  event: SerializedAgentMessageEvent
}

export function MessageRenderer({ event }: MessageRendererProps) {
  const { role, content, timestamp } = event
  const { currentProjectId } = useCurrentProject()

  return (
    <EventCard
      timestamp={timestamp}
      className={cn(
        'p-4',
        role === 'user' && 'bg-primary/10',
        role === 'assistant' && 'bg-muted',
        role === 'system' && 'bg-muted/50 italic'
      )}
      header={
        <span className="text-xs font-medium uppercase text-muted-foreground">
          {role}
        </span>
      }
    >
      <Markdown projectId={currentProjectId}>{content}</Markdown>
    </EventCard>
  )
}
