'use client'

import { useCallback, type RefObject } from 'react'
import type { TicketWithLabels } from '@kombuse/types'
import { AutocompletePopover } from './autocomplete-popover'
import { cn } from '../../lib/utils'
import { statusColors } from '../../lib/ticket-utils'

interface TicketMentionAutocompleteProps {
  tickets: TicketWithLabels[]
  selectedIndex: number
  caretOffset: { top: number; left: number; height: number }
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onSelect: (ticket: TicketWithLabels) => void
  visible: boolean
}

function TicketMentionAutocomplete({
  tickets,
  selectedIndex,
  caretOffset,
  textareaRef,
  onSelect,
  visible,
}: TicketMentionAutocompleteProps) {
  const renderItem = useCallback((ticket: TicketWithLabels) => (
    <>
      <span className="shrink-0 font-mono text-xs text-muted-foreground">#{ticket.ticket_number}</span>
      <span className="truncate">{ticket.title}</span>
      <span
        className={cn(
          'ml-auto shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium',
          statusColors[ticket.status]
        )}
      >
        {ticket.status.replace('_', ' ')}
      </span>
    </>
  ), [])

  const keyExtractor = useCallback((ticket: TicketWithLabels) => ticket.id, [])

  return (
    <AutocompletePopover
      items={tickets}
      selectedIndex={selectedIndex}
      caretOffset={caretOffset}
      textareaRef={textareaRef}
      onSelect={onSelect}
      visible={visible}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      className="min-w-[260px] max-w-[400px]"
    />
  )
}

export { TicketMentionAutocomplete }
export type { TicketMentionAutocompleteProps }
