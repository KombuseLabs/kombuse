'use client'

import { useState } from 'react'
import type { SerializedAgentToolUseEvent, SerializedAgentToolResultEvent, JsonValue } from '@kombuse/types'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/base/collapsible'
import { ExpandablePreview } from '../../expandable-preview'
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

export interface BashRendererProps {
  toolUse: SerializedAgentToolUseEvent
  result?: SerializedAgentToolResultEvent
}

export function BashRenderer({ toolUse, result }: BashRendererProps) {
  const [open, setOpen] = useState(false)
  const { input, timestamp } = toolUse
  const command = typeof input.command === 'string' ? input.command : ''
  const description = typeof input.description === 'string' ? input.description : null
  const timeout = typeof input.timeout === 'number' ? input.timeout : null
  const runInBackground = input.run_in_background === true
  const outputContent = result ? formatResultContent(result.content) : null
  const isError = result?.isError ?? false

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`rounded-lg text-sm ${isError ? 'bg-red-500/5 ring-1 ring-red-500/20' : 'bg-zinc-100 dark:bg-zinc-800/60'}`}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left">
          {open ? (
            <ChevronDown className="size-3.5 shrink-0 text-zinc-500" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-zinc-500" />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-mono text-xs">
              <span className="text-zinc-400 dark:text-zinc-500">$</span>{' '}
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{command}</span>
            </span>
            {isError ? (
              <span className="text-[10px] text-red-600 dark:text-red-400">Command failed</span>
            ) : description ? (
              <span className="truncate text-[10px] text-zinc-500">{description}</span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {runInBackground && (
              <span className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:bg-zinc-700">bg</span>
            )}
            {timeout != null && (
              <span className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:bg-zinc-700">{timeout / 1000}s</span>
            )}
            <span className="font-mono text-[10px] text-zinc-500">
              {formatEventTime(timestamp)}
            </span>
          </div>
        </CollapsibleTrigger>
        {outputContent && (
          <CollapsibleContent>
            <div className="border-t border-zinc-200 px-3 py-2 dark:border-zinc-700">
              <div className="rounded bg-zinc-800 px-3 py-2 dark:bg-zinc-900">
                <ExpandablePreview
                  className={`font-mono text-xs ${isError ? 'text-red-400' : 'text-zinc-300'}`}
                  maxLines={8}
                >
                  {outputContent}
                </ExpandablePreview>
              </div>
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  )
}
