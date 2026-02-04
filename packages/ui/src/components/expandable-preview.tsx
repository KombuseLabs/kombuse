'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../lib/utils'

export interface ExpandablePreviewProps {
  children: string
  maxLines?: number
  className?: string
}

export function ExpandablePreview({ children, maxLines = 3, className }: ExpandablePreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div
      className={cn('cursor-pointer', className)}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <pre
        className={cn(
          'overflow-x-auto whitespace-pre-wrap',
          !isExpanded && 'line-clamp-[var(--max-lines)]'
        )}
        style={{ '--max-lines': maxLines } as React.CSSProperties}
      >
        {children}
      </pre>
      <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground/70">
        {isExpanded ? (
          <>
            <ChevronDown className="size-3" />
            <span>Click to collapse</span>
          </>
        ) : (
          <>
            <ChevronRight className="size-3" />
            <span>Click to expand</span>
          </>
        )}
      </div>
    </div>
  )
}
