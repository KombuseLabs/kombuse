"use client"

import type { MilestoneWithStats } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { Target } from 'lucide-react'

interface MilestoneBadgeProps {
  milestone: MilestoneWithStats
  size?: 'sm' | 'default'
  showProgress?: boolean
  className?: string
}

function MilestoneBadge({
  milestone,
  size = 'default',
  showProgress = false,
  className,
}: MilestoneBadgeProps) {
  const isClosed = milestone.status === 'closed'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        isClosed
          ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
          : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        className
      )}
    >
      <Target className={size === 'sm' ? 'size-3' : 'size-3.5'} />
      <span className="truncate max-w-32">{milestone.title}</span>
      {showProgress && milestone.total_count > 0 && (
        <span className="opacity-70">
          {milestone.closed_count}/{milestone.total_count}
        </span>
      )}
    </span>
  )
}

export { MilestoneBadge }
export type { MilestoneBadgeProps }
