import { useState } from 'react'
import type { CommentWithAuthor, Attachment } from '@kombuse/types'
import { parseSessionId } from '@kombuse/types'
import { Link } from 'react-router-dom'
import { Button } from '../../base/button'
import { Textarea } from '../../base/textarea'
import { Tooltip, TooltipTrigger, TooltipContent } from '../../base/tooltip'
import { Markdown } from '../markdown'
import { ImageLightbox } from '../image-lightbox'
import { cn } from '../../lib/utils'
import { attachmentsApi } from '../../lib/api'
import { useSessionByKombuseId } from '../../hooks/use-sessions'
import { Pencil, Trash2, Check, X, Reply, Zap, MessageSquare } from 'lucide-react'
import { getAvatarIcon } from '../agents/avatar-picker'

interface CommentItemProps {
  comment: CommentWithAuthor
  projectId?: string | null
  attachments?: Attachment[]
  isEditing?: boolean
  editBody?: string
  onEditBodyChange?: (body: string) => void
  onStartEdit?: () => void
  onSaveEdit?: () => void
  onCancelEdit?: () => void
  onDelete?: () => void
  onReply?: () => void
  onSessionClick?: (sessionId: string) => void
  isUpdating?: boolean
  isDeleting?: boolean
  className?: string
}

function CommentItem({
  comment,
  projectId,
  attachments,
  isEditing = false,
  editBody = '',
  onEditBodyChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onReply,
  onSessionClick,
  isUpdating = false,
  isDeleting = false,
  className,
}: CommentItemProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const { data: linkedSession } = useSessionByKombuseId(comment.kombuse_session_id)

  const sessionUrl = linkedSession
    ? projectId
      ? `/projects/${projectId}/chats/${linkedSession.id}`
      : `/chats/${linkedSession.id}`
    : null

  const sessionOrigin = comment.kombuse_session_id
    ? parseSessionId(comment.kombuse_session_id)?.origin ?? null
    : null

  return (
    <div className={cn('p-3 rounded-lg bg-muted/50', className)}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {comment.author.type === 'agent' && (() => {
            const Icon = getAvatarIcon(comment.author.avatar_url)
            return <Icon className="size-4 text-muted-foreground" />
          })()}
          <span className="text-sm font-medium">{comment.author.name}</span>
          {sessionUrl && linkedSession && (
            <Tooltip>
              <TooltipTrigger asChild>
                {onSessionClick ? (
                  <button
                    type="button"
                    onClick={() => onSessionClick(linkedSession.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {sessionOrigin === 'trigger' ? (
                      <Zap className="size-3" />
                    ) : (
                      <MessageSquare className="size-3" />
                    )}
                  </button>
                ) : (
                  <Link
                    to={sessionUrl}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {sessionOrigin === 'trigger' ? (
                      <Zap className="size-3" />
                    ) : (
                      <MessageSquare className="size-3" />
                    )}
                  </Link>
                )}
              </TooltipTrigger>
              <TooltipContent>View session</TooltipContent>
            </Tooltip>
          )}
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
        <>
          <div className="text-sm">
            <Markdown projectId={projectId}>{comment.body}</Markdown>
          </div>
          {attachments && attachments.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2 mt-2">
                {attachments.map((attachment, index) => (
                  <button
                    key={attachment.id}
                    type="button"
                    onClick={() => {
                      setLightboxIndex(index)
                      setLightboxOpen(true)
                    }}
                    className="group block text-left cursor-pointer"
                  >
                    <img
                      src={attachmentsApi.downloadUrl(attachment.id)}
                      alt={attachment.filename}
                      className="max-h-48 rounded border object-cover transition-opacity group-hover:opacity-90"
                    />
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-48">
                      {attachment.filename}
                    </div>
                  </button>
                ))}
              </div>
              <ImageLightbox
                attachments={attachments}
                initialIndex={lightboxIndex}
                open={lightboxOpen}
                onOpenChange={setLightboxOpen}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}

export { CommentItem }
export type { CommentItemProps }
