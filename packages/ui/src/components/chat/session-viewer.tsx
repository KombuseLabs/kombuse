'use client'

import { useMemo } from 'react'
import type { SerializedAgentEvent, SerializedAgentToolUseEvent } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { MessageRenderer, PermissionRequestRenderer, RawRenderer, ToolResultRenderer, ToolUseRenderer } from './renderers'

interface SessionViewerProps {
  events: SerializedAgentEvent[]
  isLoading?: boolean
  emptyMessage?: string
  className?: string
}

function SessionViewer({ events, isLoading = false, emptyMessage = 'No events yet', className }: SessionViewerProps) {
  // Build maps for tool_use events and track which ones have results
  const { toolUseMap, toolUseIdsWithResults } = useMemo(() => {
    const useMap = new Map<string, SerializedAgentToolUseEvent>()
    const idsWithResults = new Set<string>()

    for (const event of events) {
      if (event.type === 'tool_use') {
        useMap.set(event.id, event)
      } else if (event.type === 'tool_result') {
        idsWithResults.add(event.toolUseId)
      }
    }

    return { toolUseMap: useMap, toolUseIdsWithResults: idsWithResults }
  }, [events])

  if (events.length === 0 && !isLoading) {
    return (
      <div className={cn('flex-1 flex items-center justify-center text-muted-foreground', className)}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={cn('flex-1 overflow-y-auto p-4 space-y-4', className)}>
      {events.map((event) => {
        if (event.type === 'message') {
          return <MessageRenderer key={`${event.type}-${event.timestamp}`} event={event} />
        }

        if (event.type === 'raw') {
          return <RawRenderer key={`${event.type}-${event.timestamp}`} event={event} />
        }

        if (event.type === 'permission_request') {
          return <PermissionRequestRenderer key={`${event.type}-${event.timestamp}`} event={event} />
        }

        // Render tool_use events - skip if they have results (rendered with result)
        if (event.type === 'tool_use') {
          if (toolUseIdsWithResults.has(event.id)) {
            return null
          }
          return <ToolUseRenderer key={`tool-use-${event.id}`} event={event} />
        }

        // Render tool_result with its matching tool_use
        if (event.type === 'tool_result') {
          const toolUse = toolUseMap.get(event.toolUseId)
          if (toolUse) {
            return (
              <ToolResultRenderer
                key={`tool-result-${event.toolUseId}`}
                toolUse={toolUse}
                result={event}
              />
            )
          }
        }

        return (
          <div
            key={`${event.type}-${event.timestamp}`}
            className="p-3 rounded-lg text-sm overflow-x-auto bg-muted"
          >
            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
              <span className="font-medium uppercase">{event.type}</span>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(event, null, 2)}
            </pre>
          </div>
        )
      })}
      {isLoading && (
        <div className="bg-muted p-3 rounded-lg text-sm">
          <span className="animate-pulse">Thinking...</span>
        </div>
      )}
    </div>
  )
}

export { SessionViewer, type SessionViewerProps }
