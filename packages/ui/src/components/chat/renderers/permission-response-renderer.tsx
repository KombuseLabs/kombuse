import type { SerializedAgentPermissionResponseEvent } from '@kombuse/types'
import { Check, X } from 'lucide-react'
import { formatEventTime } from './event-card'

export interface PermissionResponseRendererProps {
  event: SerializedAgentPermissionResponseEvent
  toolName?: string
}

export function PermissionResponseRenderer({ event, toolName }: PermissionResponseRendererProps) {
  const allowed = event.behavior === 'allow'

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
      {allowed ? (
        <Check className="size-3 text-green-600 dark:text-green-500" />
      ) : (
        <X className="size-3 text-red-600 dark:text-red-500" />
      )}
      <span>
        {allowed ? 'Allowed' : 'Denied'}
        {toolName && <span className="ml-1">&middot; {toolName}</span>}
        {!allowed && event.message && (
          <span className="ml-1 italic">&ldquo;{event.message}&rdquo;</span>
        )}
      </span>
      <span className="ml-auto shrink-0 font-mono text-[10px]">
        {formatEventTime(event.timestamp)}
      </span>
    </div>
  )
}
