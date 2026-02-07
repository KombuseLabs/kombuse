'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { Profile } from '@kombuse/types'
import { cn } from '../../lib/utils'
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
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.querySelector('[data-selected="true"]')
    selected?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!visible || profiles.length === 0 || !textareaRef.current) return null

  // Compute fixed screen position from textarea bounding rect + caret offset
  const rect = textareaRef.current.getBoundingClientRect()
  const fixedLeft = rect.left + caretOffset.left
  const fixedTop = rect.top + caretOffset.top

  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="fixed z-50 min-w-[200px] max-w-[300px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{
        left: `${fixedLeft}px`,
        bottom: `${window.innerHeight - fixedTop + 4}px`,
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div ref={listRef} className="max-h-[200px] overflow-y-auto">
        {profiles.map((profile, index) => {
          const Icon = getAvatarIcon(profile.avatar_url)
          return (
            <div
              key={profile.id}
              data-selected={index === selectedIndex}
              className={cn(
                'flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-default select-none',
                'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground'
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(profile)
              }}
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{profile.name}</span>
            </div>
          )
        })}
      </div>
    </div>,
    document.body
  )
}

export { MentionAutocomplete }
export type { MentionAutocompleteProps }
