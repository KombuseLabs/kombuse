'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SerializedAgentEvent, SerializedAgentToolUseEvent } from '@kombuse/types'
import { ArrowDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../../base/button'
import { EventCard, MessageRenderer, PermissionRequestRenderer, RawRenderer, ToolResultRenderer, ToolUseRenderer } from './renderers'
import type { ViewMode } from './session-header'

const SCROLL_THRESHOLD = 100

interface SessionViewerProps {
  events: SerializedAgentEvent[]
  isLoading?: boolean
  emptyMessage?: string
  viewMode?: ViewMode
  className?: string
}

function SessionViewer({ events, isLoading = false, emptyMessage = 'No events yet', viewMode = 'normal', className }: SessionViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const checkIfAtBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setIsAtBottom(distanceFromBottom <= SCROLL_THRESHOLD)
  }, [])

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [])

  // Auto-scroll when new events arrive and user is at the bottom
  useEffect(() => {
    if (isAtBottom) {
      const el = scrollRef.current
      if (el) {
        el.scrollTop = el.scrollHeight
      }
    }
  }, [events.length, isLoading, isAtBottom])
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

  const visibleEvents = useMemo(
    () => viewMode === 'clean' ? events.filter((e) => e.type === 'message') : events,
    [events, viewMode]
  )

  if (visibleEvents.length === 0 && !isLoading) {
    return (
      <div className={cn('flex-1 flex items-center justify-center text-muted-foreground', className)}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={cn('relative flex-1 overflow-hidden', className)}>
      <div ref={scrollRef} onScroll={checkIfAtBottom} className="h-full overflow-y-auto p-4 space-y-4">
      {visibleEvents.map((event) => {
        if (event.type === 'message') {
          return <MessageRenderer key={event.eventId} event={event} />
        }

        if (event.type === 'raw') {
          return <RawRenderer key={event.eventId} event={event} />
        }

        if (event.type === 'permission_request') {
          return <PermissionRequestRenderer key={event.eventId} event={event} />
        }

        // Render tool_use events - skip if they have results (rendered with result)
        if (event.type === 'tool_use') {
          if (toolUseIdsWithResults.has(event.id)) {
            return null
          }
          return <ToolUseRenderer key={event.eventId} event={event} />
        }

        // Render tool_result with its matching tool_use
        if (event.type === 'tool_result') {
          const toolUse = toolUseMap.get(event.toolUseId)
          if (toolUse) {
            return (
              <ToolResultRenderer
                key={event.eventId}
                toolUse={toolUse}
                result={event}
              />
            )
          }
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
      {!isAtBottom && (
        <Button
          variant="outline"
          size="icon"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full shadow-md h-8 w-8 opacity-80 hover:opacity-100 transition-opacity"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

export { SessionViewer, type SessionViewerProps }
