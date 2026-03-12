import type { SerializedAgentRawEvent } from '@kombuse/types'
import { AlertTriangle, Info, OctagonX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EventCard } from './event-card'

export interface RateLimitRendererProps {
  event: SerializedAgentRawEvent
}

interface RateLimitInfo {
  status?: string
  utilization?: number
  surpassedThreshold?: number
}

export function RateLimitRenderer({ event }: RateLimitRendererProps) {
  const { timestamp, data } = event
  const d = data as Record<string, unknown> | null

  // Current format: data.rate_limit_info
  const info = d?.rate_limit_info as RateLimitInfo | undefined

  // Legacy fallback: data.message / data.retry_after
  const legacyMessage = d?.message as string | undefined
  const legacyRetryAfter = d?.retry_after as number | undefined

  const status = info?.status ?? (legacyMessage ? 'legacy' : 'allowed')

  const isWarning = status === 'allowed_warning'
  const isError = status !== 'allowed' && status !== 'allowed_warning' && status !== 'legacy'
  const isNeutral = status === 'allowed'

  const cardClassName = cn(
    'border-l-2',
    isError && 'border-l-destructive bg-destructive/10',
    isWarning && 'border-l-amber-500 bg-amber-500/10',
    isNeutral && 'border-l-muted-foreground/30 bg-muted/30',
    status === 'legacy' && 'border-l-amber-500 bg-amber-500/10',
  )

  const Icon = isError ? OctagonX : isWarning ? AlertTriangle : Info
  const iconClassName = cn(
    'size-3.5',
    isError && 'text-destructive',
    isWarning && 'text-amber-500',
    (isNeutral || status === 'legacy') && 'text-muted-foreground',
  )

  const labelClassName = cn(
    'text-xs font-medium',
    isError && 'text-destructive',
    isWarning && 'text-amber-600 dark:text-amber-400',
    (isNeutral || status === 'legacy') && 'text-muted-foreground',
  )

  const label = isError
    ? 'Rate limited'
    : isWarning
      ? 'Rate limit warning'
      : status === 'legacy'
        ? 'Rate limited'
        : 'Rate limit'

  return (
    <EventCard
      timestamp={timestamp}
      className={cardClassName}
      header={
        <>
          <Icon className={iconClassName} />
          <span className={labelClassName}>{label}</span>
        </>
      }
    >
      <div className="space-y-1">
        {info?.utilization != null && (
          <p className="text-xs text-muted-foreground">
            Utilization: {Math.round(info.utilization * 100)}%
          </p>
        )}
        {info?.surpassedThreshold != null && (
          <p className="text-xs text-muted-foreground">
            Threshold surpassed: {Math.round(info.surpassedThreshold * 100)}%
          </p>
        )}
        {legacyMessage && <p className="text-sm">{legacyMessage}</p>}
        {legacyRetryAfter != null && (
          <p className="text-xs text-muted-foreground">
            Retry after {legacyRetryAfter}s
          </p>
        )}
      </div>
    </EventCard>
  )
}
