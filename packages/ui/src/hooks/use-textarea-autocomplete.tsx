'use client'

import {
  useState,
  useCallback,
  useMemo,
  type RefObject,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import {
  getMentionContext,
  getCaretCoordinates,
  insertMention,
} from '../lib/mention-utils'
import { useProfileSearch } from './use-profile-search'
import { useTicketSearch } from './use-ticket-search'
import { MentionAutocomplete } from '../components/chat-input/mention-autocomplete'
import { TicketMentionAutocomplete } from '../components/chat-input/ticket-mention-autocomplete'
import type { Profile, TicketWithLabels } from '@kombuse/types'

interface UseTextareaAutocompleteOptions {
  value: string
  onValueChange: (value: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  triggersEnabled?: boolean
  projectId?: string
}

export function useTextareaAutocomplete({
  value,
  onValueChange,
  textareaRef,
  triggersEnabled,
  projectId,
}: UseTextareaAutocompleteOptions) {
  const [mentionContext, setMentionContext] = useState(() =>
    getMentionContext('', 0)
  )
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const [selectedTicketIndex, setSelectedTicketIndex] = useState(0)
  const [caretPosition, setCaretPosition] = useState({
    top: 0,
    left: 0,
    height: 0,
  })

  const isProfileMention =
    mentionContext.isActive && mentionContext.trigger === '@'
  const isTicketMention =
    mentionContext.isActive && mentionContext.trigger === '#'

  const { data: mentionProfiles = [] } = useProfileSearch(
    mentionContext.query,
    { enabled: isProfileMention, projectId }
  )
  const { data: mentionTickets = [] } = useTicketSearch(
    mentionContext.query,
    { enabled: isTicketMention, projectId: projectId ?? null }
  )

  const profileDropdownVisible =
    isProfileMention && mentionProfiles.length > 0
  const ticketDropdownVisible = isTicketMention && mentionTickets.length > 0

  const handleMentionSelect = useCallback(
    (profile: Profile) => {
      const cursorPos =
        textareaRef.current?.selectionStart ?? value.length
      const { newValue, newCursorPosition } = insertMention(
        value,
        mentionContext.triggerIndex,
        cursorPos,
        profile.name,
        '@',
        profile.id
      )
      onValueChange(newValue)
      setMentionContext(getMentionContext('', 0))
      setSelectedMentionIndex(0)

      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = newCursorPosition
          textareaRef.current.selectionEnd = newCursorPosition
          textareaRef.current.focus()
        }
      })
    },
    [value, mentionContext.triggerIndex, onValueChange, textareaRef]
  )

  const handleTicketMentionSelect = useCallback(
    (ticket: TicketWithLabels) => {
      const cursorPos =
        textareaRef.current?.selectionStart ?? value.length
      const { newValue, newCursorPosition } = insertMention(
        value,
        mentionContext.triggerIndex,
        cursorPos,
        String(ticket.ticket_number),
        '#'
      )
      onValueChange(newValue)
      setMentionContext(getMentionContext('', 0))
      setSelectedTicketIndex(0)

      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = newCursorPosition
          textareaRef.current.selectionEnd = newCursorPosition
          textareaRef.current.focus()
        }
      })
    },
    [value, mentionContext.triggerIndex, onValueChange, textareaRef]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (profileDropdownVisible) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedMentionIndex((prev) =>
            prev < mentionProfiles.length - 1 ? prev + 1 : 0
          )
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedMentionIndex((prev) =>
            prev > 0 ? prev - 1 : mentionProfiles.length - 1
          )
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          const selected = mentionProfiles[selectedMentionIndex]
          if (selected) handleMentionSelect(selected)
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setMentionContext(getMentionContext('', 0))
          return
        }
      } else if (ticketDropdownVisible) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedTicketIndex((prev) =>
            prev < mentionTickets.length - 1 ? prev + 1 : 0
          )
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedTicketIndex((prev) =>
            prev > 0 ? prev - 1 : mentionTickets.length - 1
          )
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          const selected = mentionTickets[selectedTicketIndex]
          if (selected) handleTicketMentionSelect(selected)
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setMentionContext(getMentionContext('', 0))
          return
        }
      }
    },
    [
      profileDropdownVisible,
      ticketDropdownVisible,
      mentionProfiles,
      mentionTickets,
      selectedMentionIndex,
      selectedTicketIndex,
      handleMentionSelect,
      handleTicketMentionSelect,
    ]
  )

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value
      const cursorPos = e.target.selectionStart ?? val.length
      onValueChange(val)

      const ctx = getMentionContext(val, cursorPos)
      setMentionContext(ctx)
      setSelectedMentionIndex(0)
      setSelectedTicketIndex(0)

      if (ctx.isActive && textareaRef.current) {
        setCaretPosition(
          getCaretCoordinates(textareaRef.current, cursorPos)
        )
      }
    },
    [onValueChange, textareaRef]
  )

  const AutocompletePortal = useMemo(
    () =>
      function AutocompletePortalComponent() {
        return (
          <>
            <MentionAutocomplete
              profiles={mentionProfiles}
              selectedIndex={selectedMentionIndex}
              caretOffset={caretPosition}
              textareaRef={textareaRef}
              onSelect={handleMentionSelect}
              visible={profileDropdownVisible}
              triggersDisabled={triggersEnabled === false}
            />
            <TicketMentionAutocomplete
              tickets={mentionTickets}
              selectedIndex={selectedTicketIndex}
              caretOffset={caretPosition}
              textareaRef={textareaRef}
              onSelect={handleTicketMentionSelect}
              visible={ticketDropdownVisible}
            />
          </>
        )
      },
    [
      mentionProfiles,
      selectedMentionIndex,
      caretPosition,
      textareaRef,
      handleMentionSelect,
      profileDropdownVisible,
      mentionTickets,
      selectedTicketIndex,
      handleTicketMentionSelect,
      ticketDropdownVisible,
      triggersEnabled,
    ]
  )

  return {
    textareaProps: {
      onChange: handleChange,
      onKeyDown: handleKeyDown,
    },
    AutocompletePortal,
  }
}
