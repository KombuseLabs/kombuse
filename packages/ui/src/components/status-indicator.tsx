'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

const statusIndicatorVariants = cva('rounded-full shrink-0', {
  variants: {
    status: {
      idle: 'bg-muted-foreground/40',
      running: 'bg-green-500 animate-pulse',
      pending: 'bg-orange-500 animate-pulse',
      error: 'bg-red-500',
    },
    size: {
      sm: 'size-1.5',
      default: 'size-2',
      lg: 'size-2.5',
    },
  },
  defaultVariants: {
    status: 'idle',
    size: 'default',
  },
})

type StatusIndicatorStatus = 'idle' | 'running' | 'pending' | 'error'

interface StatusIndicatorProps
  extends React.ComponentProps<'span'>,
    Omit<VariantProps<typeof statusIndicatorVariants>, 'status'> {
  status: StatusIndicatorStatus
}

function StatusIndicator({
  status,
  size,
  className,
  ...props
}: StatusIndicatorProps) {
  return (
    <span
      data-slot="status-indicator"
      data-status={status}
      className={cn(statusIndicatorVariants({ status, size }), className)}
      role="status"
      aria-label={`Status: ${status}`}
      {...props}
    />
  )
}

export { StatusIndicator, statusIndicatorVariants }
export type { StatusIndicatorProps, StatusIndicatorStatus }
