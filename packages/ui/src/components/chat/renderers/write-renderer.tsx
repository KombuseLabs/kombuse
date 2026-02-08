'use client'

import { useState } from 'react'
import type { SerializedAgentToolUseEvent } from '@kombuse/types'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../base/collapsible'
import { formatEventTime } from './event-card'

function extractFilename(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || filePath
}

export interface WriteRendererProps {
  toolUse: SerializedAgentToolUseEvent
}

export function WriteRenderer({ toolUse }: WriteRendererProps) {
  const [open, setOpen] = useState(false)
  const { input, timestamp } = toolUse
  const filePath = typeof input.file_path === 'string' ? input.file_path : ''
  const filename = extractFilename(filePath)
  const content = typeof input.content === 'string' ? input.content : null
  const lineCount = content ? content.split('\n').length : 0

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg bg-muted/30 text-sm">
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left">
          {open ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <div className="flex flex-col">
            <span className="text-xs font-medium">
              <span className="text-muted-foreground">Write</span>{' '}
              {filename}
            </span>
            {lineCount > 0 && (
              <span className="text-[10px] text-muted-foreground">{lineCount} lines</span>
            )}
          </div>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
            {formatEventTime(timestamp)}
          </span>
        </CollapsibleTrigger>
        {content && (
          <CollapsibleContent>
            <div className="border-t border-border/50 px-3 py-2">
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                {content}
              </pre>
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  )
}
