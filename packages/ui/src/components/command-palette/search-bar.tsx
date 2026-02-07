'use client'

import { forwardRef } from 'react'
import { Command as CommandIcon, SearchIcon } from 'lucide-react'
import { isMacPlatform } from '@kombuse/core'
import { cn } from '../../lib/utils'

export const SearchBar = forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'>
>(function SearchBar({ className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'border-input bg-muted/50 text-muted-foreground hover:bg-muted flex h-9 w-40 items-center gap-2 rounded-md border px-3 text-sm transition-colors sm:w-64 md:w-80',
        className
      )}
      {...props}
    >
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <span className="flex-1 truncate text-left">Search commands and tickets...</span>
      <kbd className="text-muted-foreground pointer-events-none hidden select-none items-center gap-0.5 text-xs sm:inline-flex">
        {isMacPlatform() ? (
          <>
            <CommandIcon className="size-3" />
            <span>K</span>
          </>
        ) : (
          'Ctrl+K'
        )}
      </kbd>
    </button>
  )
})
