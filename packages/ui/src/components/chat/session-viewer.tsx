'use client'

import { useMemo, type ReactElement } from 'react'
import type { SerializedAgentEvent, SerializedAgentPermissionRequestEvent, SerializedAgentPermissionResponseEvent, SerializedAgentToolResultEvent, SerializedAgentToolUseEvent } from '@kombuse/types'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/base/button'
import { useScrollToBottom } from '@/hooks/use-scroll-to-bottom'
import { isValidAskUserInput } from './ask-user-types'
import { AskUserRenderer, BashRenderer, CompleteRenderer, EditRenderer, EnterPlanModeRenderer, ErrorRenderer, EventCard, formatEventTime, GlobRenderer, GrepRenderer, InitRenderer, isKombuseToolName, KombuseToolRenderer, MessageRenderer, PermissionRequestRenderer, PermissionResponseRenderer, PlanPermissionRenderer, PlanRenderer, RateLimitRenderer, RawRenderer, ReadRenderer, SystemPromptRenderer, TaskRenderer, ThinkingRenderer, TodoRenderer, ToolResultRenderer, ToolSearchRenderer, ToolUseRenderer, WriteRenderer } from './renderers'
import type { ViewMode } from './session-header'

interface SessionViewerProps {
  events: SerializedAgentEvent[]
  isLoading?: boolean
  emptyMessage?: string
  viewMode?: ViewMode
  className?: string
}

type MatchedToolRenderer = (args: {
  key: string
  toolUse: SerializedAgentToolUseEvent
  result?: SerializedAgentToolResultEvent
}) => ReactElement

const TOOL_RENDERERS: Record<string, MatchedToolRenderer> = {
  Bash: ({ key, toolUse, result }) => (
    <BashRenderer key={key} toolUse={toolUse} result={result} />
  ),
  Task: ({ key, toolUse, result }) => (
    <TaskRenderer key={key} toolUse={toolUse} result={result} />
  ),
  Read: ({ key, toolUse, result }) => (
    <ReadRenderer key={key} toolUse={toolUse} result={result} />
  ),
  Write: ({ key, toolUse, result }) => (
    <WriteRenderer key={key} toolUse={toolUse} result={result} />
  ),
  Edit: ({ key, toolUse, result }) => (
    <EditRenderer key={key} toolUse={toolUse} result={result} />
  ),
  Glob: ({ key, toolUse, result }) => (
    <GlobRenderer key={key} toolUse={toolUse} result={result} />
  ),
  Grep: ({ key, toolUse, result }) => (
    <GrepRenderer key={key} toolUse={toolUse} result={result} />
  ),
  EnterPlanMode: ({ key, toolUse, result }) => (
    <EnterPlanModeRenderer key={key} toolUse={toolUse} result={result} />
  ),
  ExitPlanMode: ({ key, toolUse, result }) => (
    <PlanRenderer key={key} toolUse={toolUse} result={result} />
  ),
  TodoWrite: ({ key, toolUse }) => (
    <TodoRenderer key={key} toolUse={toolUse} />
  ),
  ToolSearch: ({ key, toolUse, result }) => (
    <ToolSearchRenderer key={key} toolUse={toolUse} result={result} />
  ),
  AskUserQuestion: () => null as unknown as ReactElement,
}

function renderMatchedTool(
  key: string,
  toolUse: SerializedAgentToolUseEvent,
  result?: SerializedAgentToolResultEvent
): ReactElement | null {
  if (isKombuseToolName(toolUse.name)) {
    return <KombuseToolRenderer key={key} toolUse={toolUse} result={result} />
  }

  const renderer = TOOL_RENDERERS[toolUse.name]
  if (!renderer) return null
  return renderer({ key, toolUse, result })
}

function SessionViewer({ events, isLoading = false, emptyMessage = 'No events yet', viewMode = 'normal', className }: SessionViewerProps) {
  const { scrollRef, isAtBottom, isAtTop, scrollToBottom, scrollToTop, onScroll } = useScrollToBottom({
    deps: [events.length, isLoading],
  })

  // Build maps for tool_use events, track which ones have results, and index permission requests
  const { toolUseMap, toolUseIdsWithResults, permissionRequestMap, toolResultByToolUseId, permResponseByRequestId } = useMemo(() => {
    const useMap = new Map<string, SerializedAgentToolUseEvent>()
    const idsWithResults = new Set<string>()
    const permReqMap = new Map<string, SerializedAgentPermissionRequestEvent>()
    const resultByToolUseId = new Map<string, SerializedAgentToolResultEvent>()
    const permRespByReqId = new Map<string, SerializedAgentPermissionResponseEvent>()

    for (const event of events) {
      if (event.type === 'tool_use') {
        useMap.set(event.id, event)
      } else if (event.type === 'tool_result') {
        idsWithResults.add(event.toolUseId)
        resultByToolUseId.set(event.toolUseId, event)
      } else if (event.type === 'permission_request') {
        permReqMap.set(event.requestId, event)
      } else if (event.type === 'permission_response') {
        permRespByReqId.set(event.requestId, event)
      }
    }

    return { toolUseMap: useMap, toolUseIdsWithResults: idsWithResults, permissionRequestMap: permReqMap, toolResultByToolUseId: resultByToolUseId, permResponseByRequestId: permRespByReqId }
  }, [events])

  const visibleEvents = useMemo(() => {
    if (viewMode !== 'clean') {
      const lastProgressIdx = new Map<string, number>()
      events.forEach((e, i) => {
        if (e.type === 'raw' && e.sourceType === 'task_progress') {
          const taskId = (e.data as Record<string, unknown> | null)?.task_id as string | undefined
          if (taskId) lastProgressIdx.set(taskId, i)
        }
      })
      if (lastProgressIdx.size === 0) return events
      return events.filter((e, i) => {
        if (e.type === 'raw' && e.sourceType === 'task_progress') {
          const taskId = (e.data as Record<string, unknown> | null)?.task_id as string | undefined
          return taskId == null || lastProgressIdx.get(taskId) === i
        }
        return true
      })
    }

    const allowedToolNames = new Set(['ExitPlanMode', 'TodoWrite'])

    return events.filter((e) => {
      if (e.type === 'message') return true
      if (e.type === 'error') return true
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

        if (event.type === 'error') {
          return <ErrorRenderer key={event.eventId} event={event} />
        }

        if (event.type === 'complete') {
          return <CompleteRenderer key={event.eventId} event={event} />
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

        if (event.type === 'raw' && event.sourceType === 'task_started') {
          const d = event.data as Record<string, unknown> | null
          const description = d?.description as string | undefined
          const taskType = d?.task_type as string | undefined
          return (
            <div key={event.eventId} className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
              <span>
                Task started{description && <span>: {description}</span>}
                {taskType && (
                  <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                    {taskType}
                  </span>
                )}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[10px]">{formatEventTime(event.timestamp)}</span>
            </div>
          )
        }

        if (event.type === 'raw' && event.sourceType === 'task_progress') {
          const d = event.data as Record<string, unknown> | null
          const description = d?.description as string | undefined
          const usage = d?.usage as Record<string, unknown> | undefined
          const lastTool = d?.last_tool_name as string | undefined
          return (
            <div key={event.eventId} className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
              <span>
                {description ?? 'Task progress'}
                {lastTool && (
                  <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                    {lastTool}
                  </span>
                )}
                {usage && (
                  <span className="ml-1.5 font-mono text-[10px]">
                    {String(usage.tool_uses)} tools · {Math.round(Number(usage.duration_ms) / 1000)}s
                  </span>
                )}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[10px]">{formatEventTime(event.timestamp)}</span>
            </div>
          )
        }

        if (event.type === 'raw' && event.sourceType === 'init') {
          return <InitRenderer key={event.eventId} event={event} />
        }

        if (event.type === 'raw' && event.sourceType === 'rate_limit_event') {
          return <RateLimitRenderer key={event.eventId} event={event} />
        }

        if (event.type === 'raw' && event.sourceType === 'system_prompt') {
          return <SystemPromptRenderer key={event.eventId} event={event} />
        }

        if (event.type === 'raw') {
          return <RawRenderer key={event.eventId} event={event} />
        }

        if (event.type === 'permission_request') {
          if (event.toolName === 'AskUserQuestion' && isValidAskUserInput(event.input as Record<string, unknown>)) {
            let askUserAnswer: string | undefined
            const matchedResp = permResponseByRequestId.get(event.requestId)
            if (matchedResp?.behavior === 'allow') {
              const result = toolResultByToolUseId.get(event.toolUseId)
              if (result && typeof result.content === 'string') {
                askUserAnswer = result.content
              }
            }
            return <AskUserRenderer key={event.eventId} event={event} userAnswer={askUserAnswer} />
          }
          if (event.toolName === 'ExitPlanMode') {
            return <PlanPermissionRenderer key={event.eventId} event={event} />
          }
          return <PermissionRequestRenderer key={event.eventId} event={event} />
        }

        if (event.type === 'permission_response') {
          const matchedRequest = permissionRequestMap.get(event.requestId)
          let userAnswer: string | undefined
          if (matchedRequest?.toolName === 'AskUserQuestion') {
            const result = toolResultByToolUseId.get(matchedRequest.toolUseId)
            if (result && typeof result.content === 'string') {
              userAnswer = result.content
            }
          }
          return (
            <PermissionResponseRenderer
              key={event.eventId}
              event={event}
              toolName={matchedRequest?.toolName}
              userAnswer={userAnswer}
            />
          )
        }

        // Render tool_use events - skip if they have results (rendered with result)
        if (event.type === 'tool_use') {
          if (toolUseIdsWithResults.has(event.id)) {
            return null
          }
          const matched = renderMatchedTool(event.eventId, event)
          if (matched) return matched
          // Registered renderer returned null — suppress fallback (e.g. AskUserQuestion)
          if (TOOL_RENDERERS[event.name]) return null
          return <ToolUseRenderer key={event.eventId} event={event} />
        }

        // Render tool_result with its matching tool_use
        if (event.type === 'tool_result') {
          const toolUse = toolUseMap.get(event.toolUseId)
          if (toolUse) {
            const matched = renderMatchedTool(event.eventId, toolUse, event)
            if (matched) return matched
            // Registered renderer returned null — suppress fallback (e.g. AskUserQuestion)
            if (TOOL_RENDERERS[toolUse.name]) return null
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
