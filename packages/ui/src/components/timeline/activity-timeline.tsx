import type { TimelineItem, Comment, Event } from '@kombuse/types'
import { CommentItem } from '../comments/comment-item'
import { TimelineEventItem } from './timeline-event-item'
import { cn } from '../../lib/utils'

interface ActivityTimelineProps {
  items: TimelineItem[]
  editingCommentId?: number | null
  editBody?: string
  onEditBodyChange?: (body: string) => void
  onStartEditComment?: (comment: Comment) => void
  onSaveEditComment?: () => void
  onCancelEditComment?: () => void
  onDeleteComment?: (id: number) => void
  isUpdatingComment?: boolean
  isDeletingComment?: boolean
  className?: string
}

function ActivityTimeline({
  items,
  editingCommentId,
  editBody = '',
  onEditBodyChange,
  onStartEditComment,
  onSaveEditComment,
  onCancelEditComment,
  onDeleteComment,
  isUpdatingComment = false,
  isDeletingComment = false,
  className,
}: ActivityTimelineProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No activity yet</p>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item) => {
        if (item.type === 'comment') {
          const comment = item.data as Comment
          return (
            <CommentItem
              key={`comment-${comment.id}`}
              comment={comment}
              isEditing={editingCommentId === comment.id}
              editBody={editBody}
              onEditBodyChange={onEditBodyChange}
              onStartEdit={() => onStartEditComment?.(comment)}
              onSaveEdit={onSaveEditComment}
              onCancelEdit={onCancelEditComment}
              onDelete={() => onDeleteComment?.(comment.id)}
              isUpdating={isUpdatingComment}
              isDeleting={isDeletingComment}
            />
          )
        } else {
          const event = item.data as Event
          return (
            <TimelineEventItem
              key={`event-${event.id}`}
              event={event}
            />
          )
        }
      })}
    </div>
  )
}

export { ActivityTimeline }
export type { ActivityTimelineProps }
