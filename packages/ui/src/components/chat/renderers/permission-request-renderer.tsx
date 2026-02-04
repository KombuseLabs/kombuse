import type { SerializedAgentPermissionRequestEvent } from '@kombuse/types'
import { Shield } from 'lucide-react'
import { cn } from '../../../lib/utils'

export interface PermissionRequestRendererProps {
  event: SerializedAgentPermissionRequestEvent
}

export function PermissionRequestRenderer({ event }: PermissionRequestRendererProps) {
  const { toolName, input } = event
  const description = typeof input.description === 'string' ? input.description : null
  const command = typeof input.command === 'string' ? input.command : null

  return (
    <div className={cn('rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm')}>
      <div className="mb-2 flex items-center gap-2">
        <Shield className="size-4 text-amber-600 dark:text-amber-400" />
        <span className="text-xs font-medium uppercase text-amber-600 dark:text-amber-400">
          Permission Request
        </span>
        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-xs text-amber-700 dark:text-amber-300">
          {toolName}
        </span>
      </div>
      {description && (
        <p className="mb-2 text-foreground">{description}</p>
      )}
      {command && (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">
          {command}
        </pre>
      )}
      {!command && !description && (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs text-muted-foreground">
          {JSON.stringify(input, null, 2)}
        </pre>
      )}
    </div>
  )
}
