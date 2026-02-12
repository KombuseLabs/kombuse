'use client'

import type { Label } from '@kombuse/types'
import { cn } from '../../lib/utils'

interface LabelCardProps {
  label: Label
  isSelected?: boolean
  onClick?: () => void
}

function LabelCard({ label, isSelected, onClick }: LabelCardProps) {
  return (
    <div
      className={cn(
        'px-4 py-3 cursor-pointer transition-colors border-l-2 border-l-transparent',
        isSelected
          ? 'bg-accent border-l-primary'
          : 'hover:bg-accent/50'
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div
          className="size-6 rounded-full shrink-0"
          style={{ backgroundColor: label.color }}
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium truncate">{label.name}</h3>
          {label.description && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {label.description}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export { LabelCard }
export type { LabelCardProps }
