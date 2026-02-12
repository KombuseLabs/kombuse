import { useMemo } from 'react'
import type { TimelineItem, CommentWithAuthor, EventWithActor, Attachment } from '@kombuse/types'
import { CommentItem } from '../comments/comment-item'
import { TimelineEventItem } from './timeline-event-item'
import { cn } from '../../lib/utils'

interface ActivityTimelineProps {
  items: TimelineItem[]
  projectId?: string | null
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
  isUpdatingComment?: boolean
  isDeletingComment?: boolean
  className?: string
}

function ActivityTimeline({
  items,
  projectId,
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
                isUpdating={isUpdatingComment}
                isDeleting={isDeletingComment}
              />
            </div>
          )
        } else {
          const event = item.data as EventWithActor
          return (
            <div key={`event-${event.id}`} className={marginClass}>
              <TimelineEventItem
                event={event}
                projectId={projectId}
                onSessionClick={onSessionClick}
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
