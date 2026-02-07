import { useMemo } from 'react'
import type { TimelineItem, CommentWithAuthor, EventWithActor, Attachment } from '@kombuse/types'
import { CommentItem } from '../comments/comment-item'
import { TimelineEventItem } from './timeline-event-item'
import { cn } from '../../lib/utils'

interface ActivityTimelineProps {
  items: TimelineItem[]
  projectId?: string | null
  attachmentsByCommentId?: Record<number, Attachment[]>
  editingCommentId?: number | null
  editBody?: string
  onEditBodyChange?: (body: string) => void
  onStartEditComment?: (comment: CommentWithAuthor) => void
  onSaveEditComment?: () => void
  onCancelEditComment?: () => void
  onDeleteComment?: (id: number) => void
  onReplyComment?: (comment: CommentWithAuthor) => void
  onSessionClick?: (sessionId: string) => void
  isUpdatingComment?: boolean
  isDeletingComment?: boolean
  className?: string
}

function ActivityTimeline({
  items,
  projectId,
  attachmentsByCommentId,
  editingCommentId,
  editBody = '',
  onEditBodyChange,
  onStartEditComment,
  onSaveEditComment,
  onCancelEditComment,
  onDeleteComment,
  onReplyComment,
  onSessionClick,
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

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No activity yet</p>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item) => {
        if (item.type === 'comment') {
          const comment = item.data as CommentWithAuthor
          return (
            <CommentItem
              key={`comment-${comment.id}`}
              comment={comment}
              parentComment={comment.parent_id ? commentById.get(comment.parent_id) : undefined}
              projectId={projectId}
              attachments={attachmentsByCommentId?.[comment.id]}
              isEditing={editingCommentId === comment.id}
              editBody={editBody}
              onEditBodyChange={onEditBodyChange}
              onStartEdit={() => onStartEditComment?.(comment)}
              onSaveEdit={onSaveEditComment}
              onCancelEdit={onCancelEditComment}
              onDelete={() => onDeleteComment?.(comment.id)}
              onReply={() => onReplyComment?.(comment)}
              onSessionClick={onSessionClick}
              isUpdating={isUpdatingComment}
              isDeleting={isDeletingComment}
            />
          )
        } else {
          const event = item.data as EventWithActor
          return (
            <TimelineEventItem
              key={`event-${event.id}`}
              event={event}
              projectId={projectId}
              onSessionClick={onSessionClick}
            />
          )
        }
      })}
    </div>
  )
}

export { ActivityTimeline }
export type { ActivityTimelineProps }
