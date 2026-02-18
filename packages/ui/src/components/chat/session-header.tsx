'use client'

import { useState, useRef, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '../../lib/utils'
import { Button } from '../../base/button'
import { Label } from '../../base/label'
import { Popover, PopoverContent, PopoverTrigger } from '../../base/popover'
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
  /** Backend session ID shown for debugging */
  backendSessionId?: string | null
  /** Effective backend resolved for this session */
  effectiveBackend?: PublicSession['effective_backend'] | null
  /** Model actually used by the backend */
  appliedModel?: string | null
  /** Preferred model configured for this session */
  modelPreference?: string | null
  /** Agent name associated with the session */
  agentName?: string | null
  className?: string
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
  effectiveBackend,
  appliedModel,
  modelPreference,
  agentName,
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

  const usedModelLabel = appliedModel ?? 'Backend default'
  const hasBackendDetails = Boolean(
    sessionId
    || backendSessionId
    || effectiveBackend
    || appliedModel
    || modelPreference
  )
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

      {agentName && (
        <>
          <div className="w-px h-4 bg-border" />
          <span className="text-sm text-muted-foreground">{agentName}</span>
        </>
      )}

      {hasBackendDetails && (
        <>
          <div className="w-px h-4 bg-border" />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Backend details
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 space-y-3 p-3">
              <div className="border-b pb-2">
                <h4 className="text-sm font-medium text-foreground">Backend details</h4>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Backend</div>
                <div className="font-mono text-xs text-foreground/90">
                  {effectiveBackend ?? 'Unknown'}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Used model</div>
                <div className="font-mono text-xs text-foreground/90">{usedModelLabel}</div>
                {!appliedModel && modelPreference && (
                  <div className="text-[11px] text-muted-foreground">
                    Preference set: {modelPreference}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Model preference</div>
                <div className="font-mono text-xs text-foreground/90">{modelPreference ?? 'Not set'}</div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">Kombuse session ID</div>
                  {sessionId && (
                    <button
                      type="button"
                      aria-label="Copy Kombuse session ID"
                      onClick={() => handleCopy(sessionId, 'session')}
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {copiedId === 'session' ? 'Copied!' : 'Copy'}
                    </button>
                  )}
                </div>
                <div className="font-mono text-xs break-all text-foreground/90">
                  {sessionId ?? 'Not available'}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">Backend session ID</div>
                  {backendSessionId && (
                    <button
                      type="button"
                      aria-label="Copy backend session ID"
                      onClick={() => handleCopy(backendSessionId, 'backend')}
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {copiedId === 'backend' ? 'Copied!' : 'Copy'}
                    </button>
                  )}
                </div>
                <div className="font-mono text-xs break-all text-foreground/90">
                  {backendSessionId ?? 'Not available'}
                </div>
              </div>
            </PopoverContent>
          </Popover>
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
