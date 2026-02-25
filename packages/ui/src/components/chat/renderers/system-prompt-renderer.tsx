'use client'

import { useState } from 'react'
import type { SerializedAgentRawEvent } from '@kombuse/types'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../base/collapsible'
import { formatEventTime } from './event-card'

export interface SystemPromptRendererProps {
  event: SerializedAgentRawEvent
}

export function SystemPromptRenderer({ event }: SystemPromptRendererProps) {
  const [open, setOpen] = useState(false)
  const { timestamp, data } = event

  const content =
    typeof data === 'object' && data !== null && 'content' in data
      ? String((data as Record<string, unknown>).content)
      : JSON.stringify(data, null, 2)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={cn('rounded-lg bg-muted/30 text-sm')}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left">
          {open ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="text-xs font-medium italic text-muted-foreground">System Prompt</span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
            {formatEventTime(timestamp)}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border px-3 py-2">
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">
              {content}
            </p>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
