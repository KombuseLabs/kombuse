'use client'

import type { Label } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { Card, CardContent } from '../../base/card'

interface LabelCardProps {
  label: Label
  isSelected?: boolean
  onClick?: () => void
}

function LabelCard({ label, isSelected, onClick }: LabelCardProps) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:border-primary/50',
        isSelected && 'border-primary ring-1 ring-primary'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className="size-8 rounded-full shrink-0 mt-0.5"
            style={{ backgroundColor: label.color }}
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{label.name}</h3>
            {label.description && (
              <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                {label.description}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export { LabelCard }
export type { LabelCardProps }
