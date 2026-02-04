import type { SerializedAgentToolUseEvent, SerializedAgentToolResultEvent } from '@kombuse/types'
import { cn } from '../../../lib/utils'
import { ExpandablePreview } from '../../expandable-preview'

export interface ToolResultRendererProps {
  toolUse: SerializedAgentToolUseEvent
  result: SerializedAgentToolResultEvent
}

export function ToolResultRenderer({ toolUse, result }: ToolResultRendererProps) {
  const { name, input } = toolUse
  const description = typeof input.description === 'string' ? input.description : null
  const command = typeof input.command === 'string' ? input.command : null

  // Determine the input to display
  const inputDisplay = command ?? JSON.stringify(input, null, 2)

  // Format the output content
  const outputContent = typeof result.content === 'string'
    ? result.content
    : JSON.stringify(result.content, null, 2)

  return (
    <div className={cn('rounded-lg bg-muted p-3 text-sm')}>
      <div className="mb-2 flex items-center gap-2">
        <span className="font-medium">{name}</span>
        {description && (
          <span className="text-muted-foreground">{description}</span>
        )}
      </div>

      <div className="space-y-2">
        {/* IN section */}
        <div className="flex items-start gap-2">
          <span className="shrink-0 pt-2 text-xs font-medium text-muted-foreground">IN</span>
          <pre className="flex-1 overflow-x-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-xs">
            {inputDisplay}
          </pre>
        </div>

        {/* OUT section */}
        <div className="flex items-start gap-2">
          <span className="shrink-0 pt-2 text-xs font-medium text-muted-foreground">OUT</span>
          <ExpandablePreview className="flex-1 rounded bg-background p-2 font-mono text-xs" maxLines={5}>
            {outputContent}
          </ExpandablePreview>
        </div>
      </div>
    </div>
  )
}
