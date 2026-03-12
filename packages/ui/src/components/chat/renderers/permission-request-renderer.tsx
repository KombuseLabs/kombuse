import type { SerializedAgentPermissionRequestEvent } from '@kombuse/types'
import { Shield } from 'lucide-react'
import { extractPermissionDetail } from '@/lib/permission-utils'
import { EventCard } from './event-card'

export interface PermissionRequestRendererProps {
  event: SerializedAgentPermissionRequestEvent
}

export function PermissionRequestRenderer({ event }: PermissionRequestRendererProps) {
  const { toolName, input, timestamp } = event
  const description = typeof input.description === 'string' ? input.description : null
  const detail = extractPermissionDetail(toolName, input as Record<string, unknown>, description)

  return (
    <EventCard
      timestamp={timestamp}
      className="border border-border bg-muted/40"
      header={
        <>
          <Shield className="size-4 text-muted-foreground" />
          <span className="text-xs font-medium uppercase text-muted-foreground">
            Permission Request
          </span>
          <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground">
            {toolName}
          </span>
        </>
      }
    >
      {description && (
        <p className="mb-2 text-foreground">{description}</p>
      )}
      {detail && (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">
          {detail.value}
        </pre>
      )}
    </EventCard>
  )
}
