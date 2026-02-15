'use client'

import { Bot, ExternalLink } from 'lucide-react'
import { Button } from '../base/button'
import { Badge } from '../base/badge'
import { Popover, PopoverContent, PopoverTrigger } from '../base/popover'
import { useAppContext } from '../hooks/use-app-context'
import { StatusIndicator } from './status-indicator'
import type { ActiveSessionInfo } from '@kombuse/types'

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

  const sessions = [...activeSessions.values()]
  const count = sessions.length

  const getNavigationPath = (session: ActiveSessionInfo) => {
    if (session.ticketId && currentProjectId) {
      return `/projects/${currentProjectId}/tickets/${session.ticketId}?session=${session.kombuseSessionId}`
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
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2">
          <h4 className="text-sm font-medium">
            Active Agents{count > 0 ? ` (${count})` : ''}
          </h4>
        </div>
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
                    {session.ticketId ? (
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="shrink-0">{`#${session.ticketId}`}</span>
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
      </PopoverContent>
    </Popover>
  )
}
