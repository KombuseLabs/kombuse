'use client'

import { useMemo } from 'react'
import type { SerializedAgentEvent, SerializedAgentToolUseEvent } from '@kombuse/types'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../../base/button'
import { useScrollToBottom } from '../../hooks/use-scroll-to-bottom'
import { isValidAskUserInput } from './ask-user-types'
import { AddCommentRenderer, AskUserRenderer, BashRenderer, EditRenderer, EnterPlanModeRenderer, EventCard, formatEventTime, GetTicketRenderer, GlobRenderer, GrepRenderer, MessageRenderer, PermissionRequestRenderer, PlanRenderer, RawRenderer, ReadRenderer, TaskRenderer, ThinkingRenderer, TodoRenderer, ToolResultRenderer, ToolUseRenderer, UpdateTicketRenderer, WriteRenderer } from './renderers'
import type { ViewMode } from './session-header'

interface SessionViewerProps {
  events: SerializedAgentEvent[]
  isLoading?: boolean
  emptyMessage?: string
  viewMode?: ViewMode
  className?: string
}

function SessionViewer({ events, isLoading = false, emptyMessage = 'No events yet', viewMode = 'normal', className }: SessionViewerProps) {
  const { scrollRef, isAtBottom, isAtTop, scrollToBottom, scrollToTop, onScroll } = useScrollToBottom({
    deps: [events.length, isLoading],
  })

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

  const visibleEvents = useMemo(() => {
    if (viewMode !== 'clean') return events

    const allowedToolNames = new Set(['ExitPlanMode', 'TodoWrite'])

    return events.filter((e) => {
      if (e.type === 'message') return true
      if (e.type === 'tool_use' && allowedToolNames.has(e.name)) return true
      if (e.type === 'tool_result') {
        const toolUse = toolUseMap.get(e.toolUseId)
        return toolUse != null && allowedToolNames.has(toolUse.name)
      }
      return false
    })
  }, [events, viewMode, toolUseMap])

  if (visibleEvents.length === 0 && !isLoading) {
    return (
      <div className={cn('flex-1 flex items-center justify-center text-muted-foreground', className)}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={cn('relative flex-1 overflow-hidden', className)}>
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto p-4 space-y-4">
      {visibleEvents.map((event) => {
        if (event.type === 'message') {
          return <MessageRenderer key={event.eventId} event={event} />
        }

        if (event.type === 'raw' && event.sourceType === 'thinking') {
          return <ThinkingRenderer key={event.eventId} event={event} />
        }

        if (event.type === 'raw' && event.sourceType === 'process_spawn') {
          const pid = (event.data as Record<string, unknown> | null)?.pid
          return (
            <div key={event.eventId} className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
              <span>Process started{pid != null && <span className="font-mono"> (pid {String(pid)})</span>}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px]">{formatEventTime(event.timestamp)}</span>
            </div>
          )
        }

        if (event.type === 'raw') {
          return <RawRenderer key={event.eventId} event={event} />
        }

        if (event.type === 'permission_request') {
          if (event.toolName === 'AskUserQuestion' && isValidAskUserInput(event.input as Record<string, unknown>)) {
            return <AskUserRenderer key={event.eventId} event={event} />
          }
          return <PermissionRequestRenderer key={event.eventId} event={event} />
        }

        // Render tool_use events - skip if they have results (rendered with result)
        if (event.type === 'tool_use') {
          if (toolUseIdsWithResults.has(event.id)) {
            return null
          }
          if (event.name === 'Bash') {
            return <BashRenderer key={event.eventId} toolUse={event} />
          }
          if (event.name === 'Task') {
            return <TaskRenderer key={event.eventId} toolUse={event} />
          }
          if (event.name === 'Read') {
            return <ReadRenderer key={event.eventId} toolUse={event} />
          }
          if (event.name === 'Write') {
            return <WriteRenderer key={event.eventId} toolUse={event} />
          }
          if (event.name === 'Edit') {
            return <EditRenderer key={event.eventId} toolUse={event} />
          }
          if (event.name === 'Glob') {
            return <GlobRenderer key={event.eventId} toolUse={event} />
          }
          if (event.name === 'Grep') {
            return <GrepRenderer key={event.eventId} toolUse={event} />
          }
          if (event.name === 'EnterPlanMode') {
            return <EnterPlanModeRenderer key={event.eventId} toolUse={event} />
          }
          if (event.name === 'ExitPlanMode') {
            return <PlanRenderer key={event.eventId} toolUse={event} />
          }
          if (event.name === 'TodoWrite') {
            return <TodoRenderer key={event.eventId} toolUse={event} />
          }
          if (event.name === 'mcp__kombuse__add_comment') {
            return <AddCommentRenderer key={event.eventId} toolUse={event} />
          }
          if (event.name === 'mcp__kombuse__get_ticket') {
            return <GetTicketRenderer key={event.eventId} toolUse={event} />
          }
          if (event.name === 'mcp__kombuse__update_ticket') {
            return <UpdateTicketRenderer key={event.eventId} toolUse={event} />
          }
          return <ToolUseRenderer key={event.eventId} event={event} />
        }

        // Render tool_result with its matching tool_use
        if (event.type === 'tool_result') {
          const toolUse = toolUseMap.get(event.toolUseId)
          if (toolUse) {
            if (toolUse.name === 'Bash') {
              return <BashRenderer key={event.eventId} toolUse={toolUse} result={event} />
            }
            if (toolUse.name === 'Task') {
              return <TaskRenderer key={event.eventId} toolUse={toolUse} result={event} />
            }
            if (toolUse.name === 'Read') {
              return <ReadRenderer key={event.eventId} toolUse={toolUse} result={event} />
            }
            if (toolUse.name === 'Write') {
              return <WriteRenderer key={event.eventId} toolUse={toolUse} result={event} />
            }
            if (toolUse.name === 'Edit') {
              return <EditRenderer key={event.eventId} toolUse={toolUse} result={event} />
            }
            if (toolUse.name === 'Glob') {
              return <GlobRenderer key={event.eventId} toolUse={toolUse} result={event} />
            }
            if (toolUse.name === 'Grep') {
              return <GrepRenderer key={event.eventId} toolUse={toolUse} result={event} />
            }
            if (toolUse.name === 'EnterPlanMode') {
              return <EnterPlanModeRenderer key={event.eventId} toolUse={toolUse} result={event} />
            }
            if (toolUse.name === 'ExitPlanMode') {
              return <PlanRenderer key={event.eventId} toolUse={toolUse} result={event} />
            }
            if (toolUse.name === 'TodoWrite') {
              return <TodoRenderer key={event.eventId} toolUse={toolUse} />
            }
            if (toolUse.name === 'mcp__kombuse__add_comment') {
              return <AddCommentRenderer key={event.eventId} toolUse={toolUse} result={event} />
            }
            if (toolUse.name === 'mcp__kombuse__get_ticket') {
              return <GetTicketRenderer key={event.eventId} toolUse={toolUse} result={event} />
            }
            if (toolUse.name === 'mcp__kombuse__update_ticket') {
              return <UpdateTicketRenderer key={event.eventId} toolUse={toolUse} result={event} />
            }
          }
          // Render with or without matching tool_use (orphaned results show output only)
          return (
            <ToolResultRenderer
              key={event.eventId}
              toolUse={toolUse}
              result={event}
            />
          )
        }

        return (
          <EventCard
            key={event.eventId}
            timestamp={event.timestamp}
            className="bg-muted overflow-x-auto"
            header={
              <span className="text-xs font-medium uppercase text-muted-foreground">{event.type}</span>
            }
          >
            <pre className="overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(event, null, 2)}
            </pre>
          </EventCard>
        )
      })}
      {isLoading && (
        <div className="bg-muted p-3 rounded-lg text-sm">
          <span className="animate-pulse">Thinking...</span>
        </div>
      )}
      </div>
      {(!isAtTop || !isAtBottom) && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col gap-2">
          {!isAtTop && (
            <Button
              variant="outline"
              size="icon"
              className="rounded-full shadow-md h-8 w-8 opacity-80 hover:opacity-100 transition-opacity"
              onClick={scrollToTop}
              aria-label="Scroll to top"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
          {!isAtBottom && (
            <Button
              variant="outline"
              size="icon"
              className="rounded-full shadow-md h-8 w-8 opacity-80 hover:opacity-100 transition-opacity"
              onClick={scrollToBottom}
              aria-label="Scroll to bottom"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export { SessionViewer, type SessionViewerProps }
