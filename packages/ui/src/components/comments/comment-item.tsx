import { useState, useRef, useCallback } from 'react'
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
import { useTextareaAutocomplete } from '../../hooks/use-textarea-autocomplete'
import { useFileStaging } from '../../hooks/use-file-staging'
import { StagedFilePreviews } from '../staged-file-previews'
import { Pencil, Trash2, Check, X, Reply, Zap, MessageSquare, Paperclip, Play, RotateCcw } from 'lucide-react'
import { getAvatarIcon } from '../agents/avatar-picker'
import { AgentHoverCard } from '../agents'

interface CommentItemProps {
  comment: CommentWithAuthor
  parentComment?: CommentWithAuthor
  projectId?: string | null
  attachments?: Attachment[]
  isEditing?: boolean
  editBody?: string
  onEditBodyChange?: (body: string) => void
  onStartEdit?: () => void
  onSaveEdit?: (stagedFiles?: File[]) => void
  onCancelEdit?: () => void
  onDelete?: () => void
  onReply?: () => void
  onSessionClick?: (sessionId: string) => void
  isResumable?: boolean
  onResume?: () => void
  onRerun?: () => void
  isUpdating?: boolean
  isDeleting?: boolean
  className?: string
}

function CommentItem({
  comment,
  parentComment,
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
  isResumable = false,
  onResume,
  onRerun,
  isUpdating = false,
  isDeleting = false,
  className,
}: CommentItemProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const { data: linkedSession } = useSessionByKombuseId(comment.kombuse_session_id)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)
  const handleEditBodyChange = useCallback(
    (value: string) => onEditBodyChange?.(value),
    [onEditBodyChange]
  )
  const { textareaProps: autocompleteProps, AutocompletePortal } = useTextareaAutocomplete({
    value: editBody,
    onValueChange: handleEditBodyChange,
    textareaRef: editTextareaRef,
    projectId: projectId ?? undefined,
  })
  const {
    stagedFiles, previewUrls, isDragOver, hasFiles,
    removeFile, clearFiles, dragHandlers,
    handlePaste, fileInputRef, handleFileInputChange,
  } = useFileStaging()

  const handleSaveEdit = useCallback(() => {
    const files = hasFiles ? [...stagedFiles] : undefined
    clearFiles()
    onSaveEdit?.(files)
  }, [hasFiles, stagedFiles, clearFiles, onSaveEdit])

  const handleCancelEdit = useCallback(() => {
    clearFiles()
    onCancelEdit?.()
  }, [clearFiles, onCancelEdit])

  const sessionTicketId = linkedSession?.ticket_id ?? comment.ticket_id

  const sessionUrl = linkedSession && projectId
    ? `/projects/${projectId}/tickets/${sessionTicketId}?session=${linkedSession.kombuse_session_id}`
    : null

  const sessionOrigin = comment.kombuse_session_id
    ? parseSessionId(comment.kombuse_session_id)?.origin ?? null
    : null

  const authorNameNode =
    comment.author.type === 'agent' ? (
      <AgentHoverCard agentId={comment.author.id}>
        <span className="text-sm font-medium">{comment.author.name}</span>
      </AgentHoverCard>
    ) : (
      <span className="text-sm font-medium">{comment.author.name}</span>
    )

  return (
    <div id={`comment-${comment.id}`} data-testid={`comment-${comment.id}`} className={cn('p-3 rounded-lg border bg-card transition-shadow duration-1000', className)}>
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-border">
        <div className="flex items-center gap-2">
          {comment.author.type === 'agent' && (() => {
            const Icon = getAvatarIcon(comment.author.avatar_url)
            return <Icon className="size-4 text-muted-foreground" />
          })()}
          {authorNameNode}
          {sessionUrl && linkedSession && (
            <Tooltip>
              <TooltipTrigger asChild>
                {onSessionClick ? (
                  <button
                    type="button"
                    onClick={() => onSessionClick(linkedSession.kombuse_session_id!)}
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
              className="size-6 text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUpdating}
            >
              <Paperclip className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-primary"
              onClick={handleSaveEdit}
              disabled={isUpdating || !editBody.trim()}
            >
              <Check className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-destructive"
              onClick={handleCancelEdit}
            >
              <X className="size-3" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {isResumable && comment.author.type === 'agent' && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-foreground"
                      onClick={onResume}
                    >
                      <Play className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Resume agent</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-foreground"
                      onClick={onRerun}
                    >
                      <RotateCcw className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Rerun agent</TooltipContent>
                </Tooltip>
                <span className="mx-0.5 h-3 w-px bg-border" />
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="hidden size-6 text-muted-foreground hover:text-foreground"
              onClick={onReply}
            >
              <Reply className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-foreground"
              onClick={onStartEdit}
              data-testid={`comment-edit-${comment.id}`}
            >
              <Pencil className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              disabled={isDeleting}
              data-testid={`comment-delete-${comment.id}`}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        )}
      </div>
      {parentComment && (
        <div className="flex items-center gap-1 mt-1 mb-0.5 text-xs text-muted-foreground">
          <Reply className="size-3" />
          <span>
            Replying to <span className="font-medium">{parentComment.author.name}</span>
          </span>
        </div>
      )}
      {isEditing ? (
        <div
          className={cn(
            'rounded transition-colors',
            isDragOver && 'ring-2 ring-primary/50 bg-primary/5',
          )}
          {...dragHandlers}
        >
          <Textarea
            ref={editTextareaRef}
            value={editBody}
            onChange={autocompleteProps.onChange}
            onKeyDown={autocompleteProps.onKeyDown}
            onPaste={handlePaste}
            className="min-h-15 text-sm"
            autoFocus
            autoResize
          />
          <AutocompletePortal />
          <StagedFilePreviews stagedFiles={stagedFiles} previewUrls={previewUrls} onRemove={removeFile} className="mt-1" />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
        </div>
      ) : (
        <div className="text-sm">
          <Markdown projectId={projectId}>{comment.body}</Markdown>
        </div>
      )}
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
    </div>
  )
}

export { CommentItem }
export type { CommentItemProps }
