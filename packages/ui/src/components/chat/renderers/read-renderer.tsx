'use client'

import { useState } from 'react'
import type { SerializedAgentToolUseEvent, SerializedAgentToolResultEvent, JsonValue } from '@kombuse/types'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../base/collapsible'
import { formatEventTime } from './event-card'

function extractFilename(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || filePath
}

function formatResultContent(content: string | JsonValue[]): string {
  if (typeof content === 'string') return content

  if (Array.isArray(content)) {
    const texts: string[] = []
    for (const block of content) {
      if (typeof block === 'object' && block !== null && 'type' in block && (block as Record<string, unknown>).type === 'text') {
        const text = (block as Record<string, unknown>).text
        if (typeof text === 'string') {
          texts.push(text)
          continue
        }
      }
      texts.push(JSON.stringify(block, null, 2))
    }
    return texts.join('\n')
  }

  return JSON.stringify(content, null, 2)
}

export interface ReadRendererProps {
  toolUse: SerializedAgentToolUseEvent
  result?: SerializedAgentToolResultEvent
}

export function ReadRenderer({ toolUse, result }: ReadRendererProps) {
  const [open, setOpen] = useState(false)
  const { input, timestamp } = toolUse
  const filePath = typeof input.file_path === 'string' ? input.file_path : ''
  const filename = extractFilename(filePath)
  const outputContent = result ? formatResultContent(result.content) : null

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg bg-muted/30 text-sm">
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left">
          {open ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="text-xs font-medium">
            <span className="text-muted-foreground">Read</span>{' '}
            {filename}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
            {formatEventTime(timestamp)}
          </span>
        </CollapsibleTrigger>
        {outputContent && (
          <CollapsibleContent>
            <div className="border-t border-border/50 px-3 py-2">
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                {outputContent}
              </pre>
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  )
}
