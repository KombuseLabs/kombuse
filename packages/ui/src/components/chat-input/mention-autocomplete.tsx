'use client'

import { useCallback, type RefObject } from 'react'
import { AlertTriangle } from 'lucide-react'
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
  triggersDisabled?: boolean
}

function MentionAutocomplete({
  profiles,
  selectedIndex,
  caretOffset,
  textareaRef,
  onSelect,
  visible,
  triggersDisabled,
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

  const footer = triggersDisabled ? (
    <div className="border-t px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1">
      <AlertTriangle className="size-3 shrink-0" />
      <span>Triggers off — agents won't be invoked</span>
    </div>
  ) : undefined

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
      footer={footer}
    />
  )
}

export { MentionAutocomplete }
export type { MentionAutocompleteProps }
