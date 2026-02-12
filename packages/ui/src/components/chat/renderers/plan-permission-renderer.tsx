import type { SerializedAgentPermissionRequestEvent } from '@kombuse/types'
import { FileCheck } from 'lucide-react'
import { EventCard } from './event-card'

export interface PlanPermissionRendererProps {
  event: SerializedAgentPermissionRequestEvent
}

function isAllowedPromptsArray(value: unknown): value is { tool: string; prompt: string }[] {
  if (!Array.isArray(value)) return false
  return value.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).tool === 'string' &&
      typeof (item as Record<string, unknown>).prompt === 'string'
  )
}

export function PlanPermissionRenderer({ event }: PlanPermissionRendererProps) {
  const { input, timestamp } = event
  const description = typeof input.description === 'string' ? input.description : null
  const allowedPrompts = isAllowedPromptsArray(input.allowedPrompts) ? input.allowedPrompts : null

  return (
    <EventCard
      timestamp={timestamp}
      className="border border-indigo-500/30 bg-indigo-500/10"
      header={
        <>
          <FileCheck className="size-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-xs font-medium uppercase text-indigo-600 dark:text-indigo-400">
            Plan Review
          </span>
        </>
      }
    >
      {description && (
        <p className="mb-2 text-foreground">{description}</p>
      )}
      {allowedPrompts && allowedPrompts.length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            Permissions needed:
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            {allowedPrompts.map((ap, i) => (
              <span
                key={i}
                className="rounded bg-indigo-500/20 px-1.5 py-0.5 font-mono text-xs text-indigo-700 dark:text-indigo-300"
              >
                {ap.prompt}
              </span>
            ))}
          </div>
        </div>
      )}
    </EventCard>
  )
}
