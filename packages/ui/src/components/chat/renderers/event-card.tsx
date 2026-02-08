import type { ReactNode } from 'react'
import { cn } from '../../../lib/utils'

function formatEventTime(timestamp: number): string {
  const date = new Date(timestamp)
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

interface EventCardProps {
  timestamp: number
  header?: ReactNode
  children: ReactNode
  className?: string
}

function EventCard({ timestamp, header, children, className }: EventCardProps) {
  return (
    <div className={cn('rounded-lg p-3 text-sm', className)}>
      {header ? (
        <div className="mb-2 flex items-center gap-2">
          {header}
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
            {formatEventTime(timestamp)}
          </span>
        </div>
      ) : (
        <div className="mb-1 flex justify-end">
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {formatEventTime(timestamp)}
          </span>
        </div>
      )}
      {children}
    </div>
  )
}

export { EventCard, type EventCardProps, formatEventTime }
