'use client'

import { useState } from 'react'
import type { SerializedAgentToolUseEvent, SerializedAgentToolResultEvent } from '@kombuse/types'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../base/collapsible'
import { formatEventTime } from './event-card'
import { CodeDiff } from '../../code-diff'

function extractFilename(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || filePath
}

export interface EditRendererProps {
  toolUse: SerializedAgentToolUseEvent
  result?: SerializedAgentToolResultEvent
}

export function EditRenderer({ toolUse }: EditRendererProps) {
  const [open, setOpen] = useState(false)
  const { input, timestamp } = toolUse

  const filePath = typeof input.file_path === 'string' ? input.file_path : ''
  const filename = extractFilename(filePath)
  const oldString = typeof input.old_string === 'string' ? input.old_string : ''
  const newString = typeof input.new_string === 'string' ? input.new_string : ''
  const additions = newString ? newString.split('\n').length : 0
  const deletions = oldString ? oldString.split('\n').length : 0
  const hasDiff = oldString.length > 0 || newString.length > 0

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
            <span className="text-muted-foreground">Edited</span>{' '}
            {filename}{' '}
            <span className="text-green-600 dark:text-green-400">+{additions}</span>{' '}
            <span className="text-red-600 dark:text-red-400">-{deletions}</span>
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
            {formatEventTime(timestamp)}
          </span>
        </CollapsibleTrigger>
        {hasDiff && (
          <CollapsibleContent>
            <div className="border-t border-border/50 px-3 py-2">
              <div className="mb-1 truncate font-mono text-[10px] text-muted-foreground" title={filePath}>
                {filePath}
              </div>
              <CodeDiff
                original={oldString}
                modified={newString}
                filePath={filePath}
                maxHeight={400}
              />
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  )
}
