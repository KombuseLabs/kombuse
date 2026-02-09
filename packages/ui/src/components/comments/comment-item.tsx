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
import { useFileStaging, formatFileSize } from '../../hooks/use-file-staging'
import { Pencil, Trash2, Check, X, Reply, Zap, MessageSquare, Paperclip } from 'lucide-react'
import { getAvatarIcon } from '../agents/avatar-picker'

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
          />
          <AutocompletePortal />
          {stagedFiles.length > 0 && (
            <div className="flex gap-2 px-1 py-1 mt-1 overflow-x-auto">
              {stagedFiles.map((file, index) => (
                <div key={`${file.name}-${index}`} className="relative shrink-0 group">
                  <img
                    src={previewUrls[index]}
                    alt={file.name}
                    className="size-16 rounded object-cover border"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="absolute -top-1 -right-1 size-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="size-2.5" />
                  </button>
                  <div className="text-[10px] text-muted-foreground truncate max-w-16 mt-0.5">
                    {formatFileSize(file.size)}
                  </div>
                </div>
              ))}
            </div>
          )}
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
