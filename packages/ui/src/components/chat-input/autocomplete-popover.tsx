'use client'

import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'

interface AutocompletePopoverProps<T> {
  items: T[]
  selectedIndex: number
  caretOffset: { top: number; left: number; height: number }
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onSelect: (item: T) => void
  visible: boolean
  renderItem: (item: T, selected: boolean) => ReactNode
  keyExtractor: (item: T) => string | number
  className?: string
}

function AutocompletePopover<T>({
  items,
  selectedIndex,
  caretOffset,
  textareaRef,
  onSelect,
  visible,
  renderItem,
  keyExtractor,
  className,
}: AutocompletePopoverProps<T>) {
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.querySelector('[data-selected="true"]')
    selected?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!visible || items.length === 0 || !textareaRef.current) return null

  // Compute fixed screen position from textarea bounding rect + caret offset
  const rect = textareaRef.current.getBoundingClientRect()
  const fixedLeft = rect.left + caretOffset.left
  const fixedTop = rect.top + caretOffset.top

  return createPortal(
    <div
      className={cn(
        'fixed z-50 min-w-[200px] max-w-[300px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
        className
      )}
      style={{
        left: `${fixedLeft}px`,
        bottom: `${window.innerHeight - fixedTop + 4}px`,
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div ref={listRef} className="max-h-[200px] overflow-y-auto">
        {items.map((item, index) => {
          const selected = index === selectedIndex
          return (
            <div
              key={keyExtractor(item)}
              data-selected={selected}
              className={cn(
                'flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-default select-none',
                'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground'
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(item)
              }}
            >
              {renderItem(item, selected)}
            </div>
          )
        })}
      </div>
    </div>,
    document.body
  )
}

export { AutocompletePopover }
export type { AutocompletePopoverProps }
