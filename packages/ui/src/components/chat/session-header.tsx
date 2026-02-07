'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '../../lib/utils'
import { Label } from '../../base/label'
import { Switch } from '../../base/switch'

type ViewMode = 'clean' | 'normal'

interface SessionHeaderProps {
  isConnected?: boolean
  isLoading?: boolean
  eventCount: number
  lastEventTime?: number
  viewMode?: ViewMode
  onViewModeChange?: (mode: ViewMode) => void
  /** Kombuse session ID shown for debugging (e.g. "chat-abc123") */
  sessionId?: string | null
  className?: string
}

function SessionHeader({ isConnected = true, isLoading = false, eventCount, lastEventTime, viewMode = 'normal', onViewModeChange, sessionId, className }: SessionHeaderProps) {
  const [copied, setCopied] = useState(false)

  const handleCopySessionId = () => {
    if (!sessionId) return
    void navigator.clipboard.writeText(sessionId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  // Truncate to prefix + first 8 chars of the UUID portion
  const truncatedSessionId = sessionId
    ? (() => {
        const dashIndex = sessionId.indexOf('-')
        if (dashIndex === -1) return sessionId.slice(0, 12)
        const prefix = sessionId.slice(0, dashIndex + 1)
        return prefix + sessionId.slice(dashIndex + 1, dashIndex + 9)
      })()
    : null

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
        {isLoading ? (
          <>
            <span className="size-2 rounded-full bg-yellow-500 animate-pulse" />
            <span>Running</span>
          </>
        ) : (
          <>
            <span className="size-2 rounded-full bg-muted-foreground/50" />
            <span>Idle</span>
          </>
        )}
      </div>

      <div className="w-px h-4 bg-border" />

      <span>{eventCount} {eventCount === 1 ? 'event' : 'events'}</span>

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
            onClick={handleCopySessionId}
            title={`Click to copy: ${sessionId}`}
            className="font-mono text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors cursor-pointer"
          >
            {copied ? 'Copied!' : truncatedSessionId}
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
