'use client'

import { useState } from 'react'
import type { SerializedAgentToolUseEvent, SerializedAgentToolResultEvent, JsonValue } from '@kombuse/types'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../base/collapsible'
import { formatEventTime } from './event-card'

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

function countOutputLines(text: string): number {
  if (!text.trim()) return 0
  return text.trimEnd().split('\n').length
}

/** Shorten an absolute path for display (last 3 segments). */
function shortenPath(path: string): string {
  const parts = path.split('/')
  if (parts.length <= 3) return path
  return '.../' + parts.slice(-3).join('/')
}

export interface GrepRendererProps {
  toolUse: SerializedAgentToolUseEvent
  result?: SerializedAgentToolResultEvent
}

export function GrepRenderer({ toolUse, result }: GrepRendererProps) {
  const [open, setOpen] = useState(false)
  const { input, timestamp } = toolUse
  const pattern = typeof input.pattern === 'string' ? input.pattern : ''
  const path = typeof input.path === 'string' ? input.path : ''
  const outputContent = result ? formatResultContent(result.content) : null
  const lineCount = outputContent ? countOutputLines(outputContent) : 0
  const noMatches = outputContent !== null && lineCount === 0
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
              <span className="text-muted-foreground">Grep</span>{' '}
              <span className="font-mono">&quot;{pattern}&quot;</span>
              {path && (
                <span className="text-muted-foreground"> (in {shortenPath(path)})</span>
              )}
            </span>
            {isError ? (
              <span className="text-[10px] text-red-600 dark:text-red-400">Grep failed</span>
            ) : outputContent !== null ? (
              <span className="text-[10px] text-muted-foreground">
                {noMatches ? 'No matches found' : `${lineCount} line${lineCount === 1 ? '' : 's'} of output`}
              </span>
            ) : null}
          </div>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
            {formatEventTime(timestamp)}
          </span>
        </CollapsibleTrigger>
        {outputContent && !noMatches && (
          <CollapsibleContent>
            <div className="border-t border-border px-3 py-2">
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
