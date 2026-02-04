import type { SerializedAgentRawEvent } from '@kombuse/types'
import { cn } from '../../../lib/utils'
import { ExpandablePreview } from '../../expandable-preview'

export interface RawRendererProps {
  event: SerializedAgentRawEvent
}

export function RawRenderer({ event }: RawRendererProps) {
  const { sourceType, data } = event

  return (
    <div className={cn('rounded-lg bg-muted/50 p-3 text-xs')}>
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        <span className="font-medium uppercase">raw</span>
        {sourceType && (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            {sourceType}
          </span>
        )}
      </div>
      <ExpandablePreview className="text-muted-foreground">
        {JSON.stringify(data, null, 2)}
      </ExpandablePreview>
    </div>
  )
}
