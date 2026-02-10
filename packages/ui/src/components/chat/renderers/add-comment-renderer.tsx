'use client'

import { useState } from 'react'
import type { SerializedAgentToolUseEvent, SerializedAgentToolResultEvent } from '@kombuse/types'
import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../base/collapsible'
import { Markdown } from '../../markdown'
import { formatEventTime } from './event-card'

export interface AddCommentRendererProps {
  toolUse: SerializedAgentToolUseEvent
  result?: SerializedAgentToolResultEvent
}

export function AddCommentRenderer({ toolUse, result }: AddCommentRendererProps) {
  const [open, setOpen] = useState(false)
  const { input, timestamp } = toolUse
  const ticketId = typeof input.ticket_id === 'number' ? input.ticket_id : null
  const body = typeof input.body === 'string' ? input.body : ''
  const isError = result?.isError ?? false

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`rounded-lg text-sm ${isError ? 'bg-red-500/5 ring-1 ring-red-500/20' : 'bg-muted/30'}`}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left">
          {open ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-0.5 overflow-hidden">
            <span className="text-xs font-medium">
              Comment{ticketId != null && (
                <span className="text-muted-foreground"> on #{ticketId}</span>
              )}
            </span>
            {!open && body && (
              <span className="line-clamp-2 text-[11px] text-muted-foreground">{body}</span>
            )}
            {isError && (
              <span className="text-[10px] text-red-600 dark:text-red-400">Failed to add comment</span>
            )}
          </div>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
            {formatEventTime(timestamp)}
          </span>
        </CollapsibleTrigger>
        {body && (
          <CollapsibleContent>
            <div className="border-t border-border/50 px-3 py-2">
              <Markdown className="text-xs">{body}</Markdown>
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  )
}
