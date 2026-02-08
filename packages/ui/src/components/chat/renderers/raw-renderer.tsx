import type { SerializedAgentRawEvent } from '@kombuse/types'
import { ExpandablePreview } from '../../expandable-preview'
import { EventCard } from './event-card'

export interface RawRendererProps {
  event: SerializedAgentRawEvent
}

export function RawRenderer({ event }: RawRendererProps) {
  const { sourceType, data, timestamp } = event

  return (
    <EventCard
      timestamp={timestamp}
      className="bg-muted/50 text-xs"
      header={
        <>
          <span className="font-medium uppercase text-muted-foreground">raw</span>
          {sourceType && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {sourceType}
            </span>
          )}
        </>
      }
    >
      <ExpandablePreview className="text-muted-foreground">
        {JSON.stringify(data, null, 2)}
      </ExpandablePreview>
    </EventCard>
  )
}
