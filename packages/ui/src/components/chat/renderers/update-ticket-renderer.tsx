'use client'

import type { SerializedAgentToolUseEvent, SerializedAgentToolResultEvent } from '@kombuse/types'
import { Ticket } from 'lucide-react'
import { formatEventTime } from './event-card'

function summarizeChanges(input: Record<string, unknown>): string {
  const parts: string[] = []
  if (typeof input.status === 'string') parts.push(`status → ${input.status}`)
  if (typeof input.title === 'string') parts.push('title')
  if (typeof input.body === 'string') parts.push('body')
  if (typeof input.priority === 'number') parts.push(`priority → ${input.priority}`)
  if (input.assignee_id !== undefined) parts.push('assignee')
  if (Array.isArray(input.add_label_ids) && input.add_label_ids.length > 0) parts.push('labels')
  if (Array.isArray(input.remove_label_ids) && input.remove_label_ids.length > 0) parts.push('labels')
  return parts.join(', ')
}

export interface UpdateTicketRendererProps {
  toolUse: SerializedAgentToolUseEvent
  result?: SerializedAgentToolResultEvent
}

export function UpdateTicketRenderer({ toolUse, result }: UpdateTicketRendererProps) {
  const { input, timestamp } = toolUse
  const ticketId = typeof input.ticket_id === 'number' ? input.ticket_id : null
  const changes = summarizeChanges(input)
  const isError = result?.isError ?? false

  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isError ? 'bg-red-500/5 ring-1 ring-red-500/20' : 'bg-muted/30'}`}>
      <Ticket className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="text-xs font-medium">
        <span className="text-muted-foreground">Update ticket</span>
        {ticketId != null && <span> #{ticketId}</span>}
      </span>
      {changes && (
        <span className="truncate text-[11px] text-muted-foreground">{changes}</span>
      )}
      {isError && (
        <span className="shrink-0 text-[10px] text-red-600 dark:text-red-400">Failed</span>
      )}
      <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
        {formatEventTime(timestamp)}
      </span>
    </div>
  )
}
