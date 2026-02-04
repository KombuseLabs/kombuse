import type { SerializedAgentToolUseEvent } from '@kombuse/types'
import { cn } from '../../../lib/utils'

export interface ToolUseRendererProps {
  event: SerializedAgentToolUseEvent
}

export function ToolUseRenderer({ event }: ToolUseRendererProps) {
  const { name, input } = event
  const description = typeof input.description === 'string' ? input.description : null
  const command = typeof input.command === 'string' ? input.command : null

  // Determine the input to display
  const inputDisplay = command ?? JSON.stringify(input, null, 2)

  return (
    <div className={cn('rounded-lg bg-muted p-3 text-sm')}>
      <div className="mb-2 flex items-center gap-2">
        <span className="font-medium">{name}</span>
        {description && (
          <span className="text-muted-foreground">{description}</span>
        )}
      </div>

      {/* IN section */}
      <div className="flex items-start gap-2">
        <span className="shrink-0 pt-2 text-xs font-medium text-muted-foreground">IN</span>
        <pre className="flex-1 overflow-x-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-xs">
          {inputDisplay}
        </pre>
      </div>
    </div>
  )
}
