'use client'

import type { SerializedAgentToolUseEvent, SerializedAgentToolResultEvent } from '@kombuse/types'
import { Ticket } from 'lucide-react'
import { formatEventTime } from './event-card'

export interface GetTicketRendererProps {
  toolUse: SerializedAgentToolUseEvent
  result?: SerializedAgentToolResultEvent
}

export function GetTicketRenderer({ toolUse, result }: GetTicketRendererProps) {
  const { input, timestamp } = toolUse
  const ticketId = typeof input.ticket_id === 'number' ? input.ticket_id : null
  const isError = result?.isError ?? false

  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isError ? 'bg-red-500/5 ring-1 ring-red-500/20' : 'bg-muted/30'}`}>
      <Ticket className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="text-xs font-medium">
        <span className="text-muted-foreground">Get ticket</span>
        {ticketId != null && <span> #{ticketId}</span>}
      </span>
      {isError && (
        <span className="text-[10px] text-red-600 dark:text-red-400">Failed</span>
      )}
      <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
        {formatEventTime(timestamp)}
      </span>
    </div>
  )
}
