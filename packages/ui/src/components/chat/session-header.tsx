'use client'

import { useState, useRef, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '../../lib/utils'
import { Label } from '../../base/label'
import { Switch } from '../../base/switch'
import type { PublicSession } from '@kombuse/types'

type ViewMode = 'clean' | 'normal'

interface SessionHeaderProps {
  isConnected?: boolean
  isLoading?: boolean
  sessionStatus?: PublicSession['status'] | null
  terminalReason?: string | null
  terminalMessage?: string | null
  eventCount: number
  historyLoadedCount?: number | null
  historyTotalCount?: number | null
  lastEventTime?: number
  viewMode?: ViewMode
  onViewModeChange?: (mode: ViewMode) => void
  /** Kombuse session ID shown for debugging (e.g. "chat-abc123") */
  sessionId?: string | null
  /** Claude backend session ID shown for debugging */
  backendSessionId?: string | null
  className?: string
}

/** Truncate to prefix + first 8 chars of the UUID portion */
function truncateId(id: string): string {
  const dashIndex = id.indexOf('-')
  if (dashIndex === -1) return id.slice(0, 12)
  const prefix = id.slice(0, dashIndex + 1)
  return prefix + id.slice(dashIndex + 1, dashIndex + 9)
}

function humanizeReason(reason: string | null | undefined): string | null {
  if (!reason || reason.trim().length === 0) {
    return null
  }
  return reason
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function SessionHeader({
  isConnected = true,
  isLoading = false,
  sessionStatus = null,
  terminalReason = null,
  terminalMessage = null,
  eventCount,
  historyLoadedCount = null,
  historyTotalCount = null,
  lastEventTime,
  viewMode = 'normal',
  onViewModeChange,
  sessionId,
  backendSessionId,
  className,
}: SessionHeaderProps) {
  const [copiedId, setCopiedId] = useState<'session' | 'backend' | null>(null)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const handleCopy = (value: string, which: 'session' | 'backend') => {
    void navigator.clipboard.writeText(value).then(() => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      setCopiedId(which)
      copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 1500)
    })
  }

  const truncatedSessionId = sessionId ? truncateId(sessionId) : null
  const truncatedBackendId = backendSessionId ? truncateId(backendSessionId) : null
  const statusLabel = isLoading
    ? 'Running'
    : sessionStatus === 'failed'
      ? 'Failed'
      : sessionStatus === 'aborted'
        ? 'Aborted'
        : sessionStatus === 'stopped'
          ? 'Stopped'
          : sessionStatus === 'completed'
            ? 'Completed'
            : sessionStatus === 'pending'
              ? 'Pending'
              : 'Idle'
  const statusDotClass = isLoading
    ? 'bg-yellow-500 animate-pulse'
    : sessionStatus === 'failed' || sessionStatus === 'aborted'
      ? 'bg-red-500'
      : sessionStatus === 'stopped'
        ? 'bg-orange-500'
        : sessionStatus === 'completed'
          ? 'bg-green-500'
          : 'bg-muted-foreground/50'
  const statusDetail = terminalMessage ?? humanizeReason(terminalReason)
  const isHistoryTruncated = (
    historyLoadedCount !== null
    && historyTotalCount !== null
    && historyTotalCount > historyLoadedCount
  )

  return (
    <div className={cn('flex items-center gap-3 px-4 py-2 border-b text-sm text-muted-foreground', className)}>
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'size-2 rounded-full',
            isConnected ? 'bg-green-500' : 'bg-red-500'
          )}
        />
        <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
      </div>

      <div className="w-px h-4 bg-border" />

      <div className="flex items-center gap-1.5">
        <span className={cn('size-2 rounded-full', statusDotClass)} />
        <span>{statusLabel}</span>
        {statusDetail && (
          <span className="text-xs text-muted-foreground/80" title={statusDetail}>
            ({statusDetail})
          </span>
        )}
      </div>

      <div className="w-px h-4 bg-border" />

      <span>{eventCount} {eventCount === 1 ? 'event' : 'events'}</span>

      {isHistoryTruncated && (
        <>
          <div className="w-px h-4 bg-border" />
          <span className="text-amber-600/90">
            Showing latest {historyLoadedCount} of {historyTotalCount}
          </span>
        </>
      )}

      {lastEventTime && (
        <>
          <div className="w-px h-4 bg-border" />
          <span>{formatDistanceToNow(lastEventTime, { addSuffix: true })}</span>
        </>
      )}

      {truncatedSessionId && (
        <>
          <div className="w-px h-4 bg-border" />
          <button
            type="button"
            onClick={() => handleCopy(sessionId!, 'session')}
            title={`Click to copy: ${sessionId}`}
            className="font-mono text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors cursor-pointer"
          >
            {copiedId === 'session' ? 'Copied!' : truncatedSessionId}
          </button>
        </>
      )}

      {truncatedBackendId && (
        <>
          <div className="w-px h-4 bg-border" />
          <button
            type="button"
            onClick={() => handleCopy(backendSessionId!, 'backend')}
            title={`Click to copy: ${backendSessionId}`}
            className="font-mono text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors cursor-pointer"
          >
            {copiedId === 'backend' ? 'Copied!' : truncatedBackendId}
          </button>
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Label htmlFor="view-mode-toggle" className="text-xs cursor-pointer">Clean</Label>
        <Switch
          id="view-mode-toggle"
          checked={viewMode === 'clean'}
          onCheckedChange={(checked) => onViewModeChange?.(checked ? 'clean' : 'normal')}
        />
      </div>
    </div>
  )
}

export { SessionHeader, type SessionHeaderProps, type ViewMode }
