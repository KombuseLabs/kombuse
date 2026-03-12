import { useMemo } from 'react'
import type { TimelineItem, CommentWithAuthor, EventWithActor, Attachment } from '@kombuse/types'
import { CommentItem } from '../comments/comment-item'
import { TimelineEventItem } from './timeline-event-item'
import { cn } from '@/lib/utils'

interface ActivityTimelineProps {
  items: TimelineItem[]
  projectId?: string | null
  ticketNumber?: number
  attachmentsByCommentId?: Record<number, Attachment[]>
  highlightedCommentId?: number | null
  editingCommentId?: number | null
  editBody?: string
  onEditBodyChange?: (body: string) => void
  onStartEditComment?: (comment: CommentWithAuthor) => void
  onSaveEditComment?: (stagedFiles?: File[]) => void
  onCancelEditComment?: () => void
  onDeleteComment?: (id: number) => void
  onReplyComment?: (comment: CommentWithAuthor) => void
  onSessionClick?: (sessionId: string) => void
  /** Set of kombuse_session_ids eligible for Resume/Rerun (most recent per agent) */
  resumableSessionIds?: Set<string>
  /** Resume an agent session (sends "continue" to existing session) */
  onResume?: (kombuseSessionId: string, agentId: string) => void
  /** Rerun an agent session (new session, replays first message) */
  onRerun?: (kombuseSessionId: string, agentId: string) => void
  isUpdatingComment?: boolean
  isDeletingComment?: boolean
  className?: string
}

function ActivityTimeline({
  items,
  projectId,
  ticketNumber,
  attachmentsByCommentId,
  highlightedCommentId,
  editingCommentId,
  editBody = '',
  onEditBodyChange,
  onStartEditComment,
  onSaveEditComment,
  onCancelEditComment,
  onDeleteComment,
  onReplyComment,
  onSessionClick,
  resumableSessionIds,
  onResume,
  onRerun,
  isUpdatingComment = false,
  isDeletingComment = false,
  className,
}: ActivityTimelineProps) {
  const commentById = useMemo(() => {
    const map = new Map<number, CommentWithAuthor>()
    for (const item of items) {
      if (item.type === 'comment') {
        const comment = item.data as CommentWithAuthor
        map.set(comment.id, comment)
      }
    }
    return map
  }, [items])

  // Only show Resume/Rerun on the last item per resumable session
  const lastItemKeyPerSession = useMemo(() => {
    if (!resumableSessionIds?.size) return new Set<string>()
    const lastKey = new Map<string, string>()
    for (const item of items) {
      const sessionId = item.type === 'comment'
        ? (item.data as CommentWithAuthor).kombuse_session_id
        : (item.data as EventWithActor).kombuse_session_id
      if (sessionId && resumableSessionIds.has(sessionId)) {
        const itemKey = item.type === 'comment'
          ? `comment-${(item.data as CommentWithAuthor).id}`
          : `event-${(item.data as EventWithActor).id}`
        lastKey.set(sessionId, itemKey)
      }
    }
    return new Set(lastKey.values())
  }, [items, resumableSessionIds])

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No activity yet</p>
    )
  }

  return (
    <div className={cn(className)}>
      {items.map((item, index) => {
        const prevItem = index > 0 ? items[index - 1] : null
        const isComment = item.type === 'comment'
        const prevIsComment = prevItem?.type === 'comment'

        const marginClass = index === 0
          ? ''
          : isComment
            ? 'mt-5'
            : prevIsComment
              ? 'mt-2'
              : 'mt-1'

        if (isComment) {
          const comment = item.data as CommentWithAuthor
          const isResumable = lastItemKeyPerSession.has(`comment-${comment.id}`)
          return (
            <div key={`comment-${comment.id}`} className={marginClass}>
              <CommentItem
                comment={comment}
                parentComment={comment.parent_id ? commentById.get(comment.parent_id) : undefined}
                projectId={projectId}
                attachments={attachmentsByCommentId?.[comment.id]}
                isEditing={editingCommentId === comment.id}
                className={highlightedCommentId === comment.id ? 'ring-2 ring-primary' : undefined}
                editBody={editBody}
                onEditBodyChange={onEditBodyChange}
                onStartEdit={() => onStartEditComment?.(comment)}
                onSaveEdit={onSaveEditComment}
                onCancelEdit={onCancelEditComment}
                onDelete={() => onDeleteComment?.(comment.id)}
                onReply={() => onReplyComment?.(comment)}
                onSessionClick={onSessionClick}
                isResumable={isResumable}
                onResume={
                  isResumable && comment.kombuse_session_id
                    ? () => onResume?.(comment.kombuse_session_id!, comment.author_id)
                    : undefined
                }
                onRerun={
                  isResumable && comment.kombuse_session_id
                    ? () => onRerun?.(comment.kombuse_session_id!, comment.author_id)
                    : undefined
                }
                isUpdating={isUpdatingComment}
                isDeleting={isDeletingComment}
              />
            </div>
          )
        } else {
          const event = item.data as EventWithActor
          const isResumable = lastItemKeyPerSession.has(`event-${event.id}`)
          return (
            <div key={`event-${event.id}`} className={marginClass}>
              <TimelineEventItem
                event={event}
                projectId={projectId}
                ticketNumber={ticketNumber}
                onSessionClick={onSessionClick}
                isResumable={isResumable}
                onResume={
                  isResumable && event.kombuse_session_id && event.actor_id
                    ? () => onResume?.(event.kombuse_session_id!, event.actor_id!)
                    : undefined
                }
                onRerun={
                  isResumable && event.kombuse_session_id && event.actor_id
                    ? () => onRerun?.(event.kombuse_session_id!, event.actor_id!)
                    : undefined
                }
              />
            </div>
          )
        }
      })}
    </div>
  )
}

export { ActivityTimeline }
export type { ActivityTimelineProps }
