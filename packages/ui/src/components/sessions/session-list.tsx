import { useState } from 'react'
import type { PublicSession } from '@kombuse/types'
import { parseSessionId } from '@kombuse/types'
import { formatDistanceToNowStrict } from 'date-fns'
import { MessageSquare, Trash2, Zap } from 'lucide-react'
import { cn } from '../../lib/utils'
import { StatusIndicator, type StatusIndicatorStatus } from '../status-indicator'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../base'

function getIndicatorStatus(
  session: PublicSession,
  hasPendingPermission: boolean
): StatusIndicatorStatus {
  if (hasPendingPermission) return 'pending'
  if (session.status === 'running') return 'running'
  if (session.status === 'failed') return 'error'
  if (session.status === 'aborted') return 'error'
  return 'idle'
}

function getSessionLabel(session: PublicSession): { origin: 'chat' | 'trigger' | null; label: string } {
  const origin = session.kombuse_session_id
    ? (parseSessionId(session.kombuse_session_id)?.origin ?? null)
    : null

  if (session.agent_name) {
    return { origin, label: session.agent_name }
  }
  if (session.prompt_preview) {
    return { origin, label: session.prompt_preview }
  }

  const shortId = session.kombuse_session_id
    ? (parseSessionId(session.kombuse_session_id)?.uuid.slice(0, 8) ?? 'Unknown')
    : 'Unknown'
  return { origin, label: shortId }
}

function shortTimeAgo(date: Date): string {
  const str = formatDistanceToNowStrict(date)
  return str
    .replace(/ seconds?/, 's')
    .replace(/ minutes?/, 'm')
    .replace(/ hours?/, 'h')
    .replace(/ days?/, 'd')
    .replace(/ months?/, 'mo')
    .replace(/ years?/, 'y')
}

const OriginIcon = ({ origin }: { origin: 'chat' | 'trigger' | null }) => {
  if (origin === 'trigger') return <Zap className="size-3.5 text-muted-foreground" />
  return <MessageSquare className="size-3.5 text-muted-foreground" />
}

function getStatusText(session: PublicSession, hasPendingPermission: boolean): string {
  if (hasPendingPermission) return 'Awaiting input'
  switch (session.status) {
    case 'running':
      return 'Running'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'aborted':
      return 'Aborted'
    default:
      return session.status
  }
}

export interface SessionItemProps {
  session: PublicSession
  isSelected?: boolean
  onClick?: () => void
  onDelete?: () => void
  hasPendingPermission?: boolean
}

function SessionItem({
  session,
  isSelected,
  onClick,
  onDelete,
  hasPendingPermission = false,
}: SessionItemProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const indicatorStatus = getIndicatorStatus(session, hasPendingPermission)
  const { origin, label } = getSessionLabel(session)
  const statusText = getStatusText(session, hasPendingPermission)

  return (
    <div
      className={cn(
        'group px-4 py-3 cursor-pointer transition-colors border-l-2 border-l-transparent',
        isSelected
          ? 'bg-accent border-l-primary'
          : 'hover:bg-accent/50'
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2">
            <StatusIndicator status={indicatorStatus} size="sm" />
            <OriginIcon origin={origin} />
            <span className="text-sm font-medium truncate">{label}</span>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1 pl-3.5">
            <span className={cn(
              'text-xs',
              session.status === 'failed' || session.status === 'aborted'
                ? 'text-destructive/70'
                : 'text-muted-foreground'
            )}>
              {statusText}
            </span>
            {session.ticket_id && (
              <span className="text-xs text-muted-foreground font-mono">
                #{session.ticket_id}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {shortTimeAgo(new Date(session.started_at))}
            </span>
          </div>
        </div>

        {/* Delete button */}
        {onDelete && (
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogTrigger asChild>
              <span
                role="button"
                onClick={(e) => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 rounded p-1 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-3.5" />
              </span>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete session?</DialogTitle>
                <DialogDescription>
                  This will permanently delete this chat session and all its messages.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    onDelete()
                    setShowDeleteDialog(false)
                  }}
                >
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  )
}

export interface SessionListProps {
  sessions: PublicSession[]
  className?: string
  selectedSessionId?: string | null
  onSessionClick?: (session: PublicSession) => void
  onSessionDelete?: (session: PublicSession) => void
  isSessionPendingPermission?: (kombuseSessionId: string | null) => boolean
  isLoading?: boolean
  emptyMessage?: string
}

function SessionList({
  sessions,
  className,
  selectedSessionId,
  onSessionClick,
  onSessionDelete,
  isSessionPendingPermission,
  isLoading,
  emptyMessage = 'No sessions yet',
}: SessionListProps) {
  if (isLoading) {
    return (
      <div className={cn('text-sm text-muted-foreground px-3 py-2', className)}>
        Loading sessions...
      </div>
    )
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground px-3 py-2', className)}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border divide-y', className)}>
      {sessions.map((session) => (
        <SessionItem
          key={session.kombuse_session_id!}
          session={session}
          isSelected={selectedSessionId === session.kombuse_session_id}
          onClick={() => onSessionClick?.(session)}
          onDelete={onSessionDelete ? () => onSessionDelete(session) : undefined}
          hasPendingPermission={
            isSessionPendingPermission?.(session.kombuse_session_id) ?? false
          }
        />
      ))}
    </div>
  )
}

export { SessionItem, SessionList }
