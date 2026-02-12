'use client'

import { useState } from 'react'
import type { SerializedAgentToolUseEvent, SerializedAgentToolResultEvent } from '@kombuse/types'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../base/collapsible'
import { formatEventTime } from './event-card'
import { CodeViewer } from '../../code-viewer'

function extractFilename(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || filePath
}

export interface WriteRendererProps {
  toolUse: SerializedAgentToolUseEvent
  result?: SerializedAgentToolResultEvent
}

export function WriteRenderer({ toolUse, result }: WriteRendererProps) {
  const [open, setOpen] = useState(false)
  const { input, timestamp } = toolUse
  const filePath = typeof input.file_path === 'string' ? input.file_path : ''
  const filename = extractFilename(filePath)
  const content = typeof input.content === 'string' ? input.content : null
  const lineCount = content ? content.split('\n').length : 0
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
          <div className="flex flex-col">
            <span className="text-xs font-medium">
              <span className="text-muted-foreground">Write</span>{' '}
              {filename}
            </span>
            {isError ? (
              <span className="text-[10px] text-red-600 dark:text-red-400">Write failed</span>
            ) : lineCount > 0 ? (
              <span className="text-[10px] text-muted-foreground">{lineCount} lines</span>
            ) : null}
          </div>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
            {formatEventTime(timestamp)}
          </span>
        </CollapsibleTrigger>
        {content && (
          <CollapsibleContent>
            <div className="border-t border-border px-3 py-2">
              <CodeViewer value={content} filePath={filePath} maxHeight={300} />
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  )
}
