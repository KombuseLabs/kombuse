'use client'

import { useMemo, useContext, useState, useEffect } from 'react'
import { Bot, ExternalLink, RefreshCw } from 'lucide-react'
import { Button } from '../base/button'
import { Badge } from '../base/badge'
import { Popover, PopoverContent, PopoverTrigger } from '../base/popover'
import { useAppContext } from '../hooks/use-app-context'
import { useCurrentUserProfile } from '../hooks/use-profile'
import { useProfileSetting } from '../hooks/use-profile-settings'
import { useBackendStatus, useRefreshBackendStatus } from '../hooks/use-backend-status'
import { backendLabel } from '../lib/backend-utils'
import { cn } from '../lib/utils'
import { StatusIndicator } from './status-indicator'
import { WebSocketCtx } from '../providers/websocket-context'
import type { ActiveSessionInfo, BackendStatus } from '@kombuse/types'

export interface ActiveAgentsIndicatorProps {
  onNavigate?: (path: string) => void
}

function humanizeBackend(backend: ActiveSessionInfo['effectiveBackend']): string {
  if (!backend) return 'Unknown'

  const knownLabel = {
    'claude-code': 'Claude Code',
    codex: 'Codex',
    mock: 'Mock',
  }[backend]
  if (knownLabel) return knownLabel

  return backend
    .split('-')
    .filter(Boolean)
    .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function statusDotColor(status: BackendStatus): string {
  return status.available ? 'bg-green-500' : 'bg-amber-500'
}

function formatDuration(startedAt: string): string {
  const elapsed = Date.now() - new Date(startedAt).getTime()
  const seconds = Math.floor(elapsed / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export function ActiveAgentsIndicator({ onNavigate }: ActiveAgentsIndicatorProps) {
  const { activeSessions, currentProjectId } = useAppContext()
  const { data: profile } = useCurrentUserProfile()
  const { data: scopeSetting } = useProfileSetting(profile?.id ?? '', 'notifications.scope_to_project')
  const scopeToProject = scopeSetting?.setting_value !== 'all'
  const { data: backendStatuses } = useBackendStatus()
  const refreshMutation = useRefreshBackendStatus()
  const wsCtx = useContext(WebSocketCtx)
  const isConnected = wsCtx?.isConnected ?? true

  const sessions = useMemo(() => {
    const all = [...activeSessions.values()]
    if (!scopeToProject) return all
    if (!currentProjectId) return []
    return all.filter((s) => s.projectId === currentProjectId)
  }, [activeSessions, scopeToProject, currentProjectId])
  const count = sessions.length

  const [, tick] = useState(0)
  useEffect(() => {
    if (count === 0) return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [count])

  const getNavigationPath = (session: ActiveSessionInfo) => {
    if (session.ticketNumber && currentProjectId) {
      return `/projects/${currentProjectId}/tickets/${session.ticketNumber}?session=${session.kombuseSessionId}`
    }
    if (currentProjectId) {
      return `/projects/${currentProjectId}/chats/${session.kombuseSessionId}`
    }
    return '/'
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bot className="size-5" />
          {count > 0 && (
            <Badge
              className="absolute -top-1 -right-1 flex size-5 items-center justify-center bg-green-600 p-0 text-xs text-white hover:bg-green-600"
            >
              {count > 9 ? '9+' : count}
            </Badge>
          )}
          {!isConnected && (
            <span
              className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-amber-500 animate-pulse"
              aria-hidden="true"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2">
          <h4 className="text-sm font-medium">
            Active Agents{count > 0 ? ` (${count})` : ''}
          </h4>
        </div>
        {!isConnected && (
          <div className="border-b bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
            Live updates paused &mdash; reconnecting
          </div>
        )}
        {sessions.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No agents running
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {sessions.map((session) => (
              <div
                key={session.kombuseSessionId}
                className="border-b p-3 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <StatusIndicator status="running" size="sm" />
                  <span className="truncate text-sm font-medium">
                    {session.agentName}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {formatDuration(session.startedAt)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 pl-3.5">
                  <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                    {session.ticketNumber ? (
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="shrink-0">{`#${session.ticketNumber}`}</span>
                        {session.ticketTitle ? (
                          <span className="truncate">{session.ticketTitle}</span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="truncate">Chat</span>
                    )}
                  </div>
                  {onNavigate && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-6 shrink-0 px-1.5 text-xs"
                      onClick={() => onNavigate(getNavigationPath(session))}
                    >
                      <ExternalLink className="mr-1 size-3" />
                      Open
                    </Button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-3.5">
                  <Badge
                    variant="secondary"
                    className="h-5 px-1.5 text-[10px] font-medium"
                  >
                    {`Backend: ${humanizeBackend(session.effectiveBackend)}`}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="h-5 px-1.5 text-[10px] font-medium"
                  >
                    {`Model: ${session.appliedModel ?? 'Backend default'}`}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
        {backendStatuses && backendStatuses.length > 0 && (
          <div className="border-t">
            <div className="px-3 py-2">
              <h4 className="text-sm font-medium">Backend Status</h4>
            </div>
            <div className="space-y-2 px-3 pb-3">
              {backendStatuses.map((status) => (
                <div key={status.backendType} className="flex items-center gap-2">
                  <span
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      statusDotColor(status),
                    )}
                  />
                  <span className="text-sm font-medium">
                    {backendLabel(status.backendType)}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {status.available
                      ? status.version ?? 'installed'
                      : 'not found'}
                  </span>
                </div>
              ))}
            </div>
            {backendStatuses.some((s) => !s.available) && (
              <div className="border-t px-3 py-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => refreshMutation.mutate()}
                  disabled={refreshMutation.isPending}
                >
                  <RefreshCw
                    className={cn(
                      'mr-1.5 size-3',
                      refreshMutation.isPending && 'animate-spin',
                    )}
                  />
                  Check Again
                </Button>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
