'use client'

import type { Label } from '@kombuse/types'
import { cn } from '@/lib/utils'
import { Puzzle, Zap } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/base/tooltip'
import { useSmartLabels } from '@/hooks/use-app-context'

interface LabelCardProps {
  label: Label
  isSelected?: boolean
  pluginName?: string
  onClick?: () => void
}

function LabelCard({ label, isSelected, pluginName, onClick }: LabelCardProps) {
  const { isSmartLabel } = useSmartLabels()

  return (
    <div
      className={cn(
        'cursor-pointer rounded-xl px-3 py-3 transition-colors',
        isSelected
          ? 'bg-accent/70 shadow-sm ring-1 ring-primary/35'
          : 'hover:bg-accent/35',
        pluginName && !label.is_enabled && 'opacity-50',
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "size-6 rounded-full shrink-0 transition-shadow",
            isSelected && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
          )}
          style={{ backgroundColor: label.color }}
        />
        <div className="flex-1 min-w-0">
          <h3 className={cn(
            'text-sm flex items-center gap-1',
            isSelected ? 'font-semibold' : 'font-medium',
          )}
          >
            <span className="truncate">{label.name}</span>
            {isSmartLabel(label.id) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex"><Zap className="size-3 text-muted-foreground shrink-0" /></span>
                </TooltipTrigger>
                <TooltipContent>Triggers an agent</TooltipContent>
              </Tooltip>
            )}
            {pluginName && (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground shrink-0">
                <Puzzle className="size-3" />
                {pluginName}
              </span>
            )}
          </h3>
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
