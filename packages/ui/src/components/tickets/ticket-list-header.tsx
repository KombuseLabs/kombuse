import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface TicketListHeaderProps {
  title: ReactNode
  meta?: ReactNode
  controls?: ReactNode
  filters?: ReactNode
  className?: string
}

function TicketListHeader({ title, meta, controls, filters, className }: TicketListHeaderProps) {
  return (
    <div className={cn('space-y-1.5 px-3 py-2 md:space-y-3 md:p-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-lg md:text-2xl font-bold leading-tight">{title}</h1>
          {meta ? (
            <div className="text-sm text-muted-foreground">
              {meta}
            </div>
          ) : null}
        </div>
        {controls ? <div className="shrink-0">{controls}</div> : null}
      </div>
      {filters ? <div className="space-y-2">{filters}</div> : null}
    </div>
  )
}

export type { TicketListHeaderProps }
export { TicketListHeader }
