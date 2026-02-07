'use client'

import { useCallback, type RefObject } from 'react'
import type { Profile } from '@kombuse/types'
import { AutocompletePopover } from './autocomplete-popover'
import { getAvatarIcon } from '../agents/avatar-picker'

interface MentionAutocompleteProps {
  profiles: Profile[]
  selectedIndex: number
  /** Caret coordinates relative to the textarea element */
  caretOffset: { top: number; left: number; height: number }
  /** Ref to the textarea for computing screen position */
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onSelect: (profile: Profile) => void
  visible: boolean
}

function MentionAutocomplete({
  profiles,
  selectedIndex,
  caretOffset,
  textareaRef,
  onSelect,
  visible,
}: MentionAutocompleteProps) {
  const renderItem = useCallback((profile: Profile) => {
    const Icon = getAvatarIcon(profile.avatar_url)
    return (
      <>
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{profile.name}</span>
      </>
    )
  }, [])

  const keyExtractor = useCallback((profile: Profile) => profile.id, [])

  return (
    <AutocompletePopover
      items={profiles}
      selectedIndex={selectedIndex}
      caretOffset={caretOffset}
      textareaRef={textareaRef}
      onSelect={onSelect}
      visible={visible}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
    />
  )
}

export { MentionAutocomplete }
export type { MentionAutocompleteProps }
