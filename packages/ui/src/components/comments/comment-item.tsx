import type { CommentWithAuthor } from '@kombuse/types'
import { Button } from '../../base/button'
import { Textarea } from '../../base/textarea'
import { Markdown } from '../markdown'
import { cn } from '../../lib/utils'
import { Pencil, Trash2, Check, X, Reply } from 'lucide-react'

interface CommentItemProps {
  comment: CommentWithAuthor
  isEditing?: boolean
  editBody?: string
  onEditBodyChange?: (body: string) => void
  onStartEdit?: () => void
  onSaveEdit?: () => void
  onCancelEdit?: () => void
  onDelete?: () => void
  onReply?: () => void
  isUpdating?: boolean
  isDeleting?: boolean
  className?: string
}

function CommentItem({
  comment,
  isEditing = false,
  editBody = '',
  onEditBodyChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onReply,
  isUpdating = false,
  isDeleting = false,
  className,
}: CommentItemProps) {
  return (
    <div className={cn('p-3 rounded-lg bg-muted/50', className)}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{comment.author.name}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(comment.created_at).toLocaleString()}
          </span>
          {comment.is_edited && (
            <span className="text-xs text-muted-foreground">(edited)</span>
          )}
        </div>
        {isEditing ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-primary"
              onClick={onSaveEdit}
              disabled={isUpdating || !editBody.trim()}
            >
              <Check className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-destructive"
              onClick={onCancelEdit}
            >
              <X className="size-3" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-foreground"
              onClick={onReply}
            >
              <Reply className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-foreground"
              onClick={onStartEdit}
            >
              <Pencil className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              disabled={isDeleting}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        )}
      </div>
      {isEditing ? (
        <Textarea
          value={editBody}
          onChange={(e) => onEditBodyChange?.(e.target.value)}
          className="min-h-15 text-sm"
          autoFocus
        />
      ) : (
        <div className="text-sm">
          <Markdown>{comment.body}</Markdown>
        </div>
      )}
    </div>
  )
}

export { CommentItem }
export type { CommentItemProps }
