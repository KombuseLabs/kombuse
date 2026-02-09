'use client'

import { useState, useCallback, useRef, type FormEvent, type KeyboardEvent } from 'react'
import { Button } from '../../base/button'
import { Textarea } from '../../base/textarea'
import { cn } from '../../lib/utils'
import { useTextareaAutocomplete } from '../../hooks/use-textarea-autocomplete'
import { useFileStaging, formatFileSize } from '../../hooks/use-file-staging'
import { Send, Loader2, X, Paperclip } from 'lucide-react'

export interface ReplyTarget {
  commentId: number
  authorId: string
  isAgentSession: boolean
}

interface ChatInputProps {
  onSubmit: (message: string, files?: File[]) => void | Promise<void>
  placeholder?: string
  isLoading?: boolean
  disabled?: boolean
  replyTarget?: ReplyTarget | null
  onCancelReply?: () => void
  className?: string
}

function ChatInput({
  onSubmit,
  placeholder = 'Type a message...',
  isLoading = false,
  disabled = false,
  replyTarget,
  onCancelReply,
  className,
}: ChatInputProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const {
    stagedFiles,
    previewUrls,
    isDragOver,
    hasFiles,
    removeFile,
    clearFiles,
    dragHandlers,
    handlePaste,
    fileInputRef,
    handleFileInputChange,
  } = useFileStaging()

  const { textareaProps: autocompleteProps, AutocompletePortal } = useTextareaAutocomplete({
    value: message,
    onValueChange: setMessage,
    textareaRef,
  })

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault()
      const trimmed = message.trim()
      if ((!trimmed && !hasFiles) || isLoading || disabled) return

      const filesToSend = hasFiles ? [...stagedFiles] : undefined
      await onSubmit(trimmed, filesToSend)
      setMessage('')
      clearFiles()
    },
    [message, hasFiles, stagedFiles, isLoading, disabled, onSubmit, clearFiles]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Let autocomplete handle its keys first
      autocompleteProps.onKeyDown(e)
      if (e.defaultPrevented) return

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [autocompleteProps.onKeyDown, handleSubmit]
  )

  const isDisabled = disabled || isLoading
  const canSubmit = (message.trim().length > 0 || hasFiles) && !isDisabled

  const effectivePlaceholder = replyTarget
    ? `Reply to ${replyTarget.authorId}...`
    : placeholder

  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-lg transition-colors',
        isDragOver && 'ring-2 ring-primary/50 bg-primary/5',
        className,
      )}
      {...dragHandlers}
    >
      {replyTarget && (
        <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground bg-muted/50 rounded">
          <span className="truncate">
            Replying to <span className="font-medium text-foreground">{replyTarget.authorId}</span>
            {replyTarget.isAgentSession && ' (resumes agent session)'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-4 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onCancelReply}
          >
            <X className="size-3" />
          </Button>
        </div>
      )}
      {stagedFiles.length > 0 && (
        <div className="flex gap-2 px-1 py-1 overflow-x-auto">
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
      <form onSubmit={handleSubmit} className="flex gap-2 items-end">
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={autocompleteProps.onChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={effectivePlaceholder}
          disabled={isDisabled}
          className="min-h-[80px] resize-none"
          rows={3}
        />
        <div className="flex flex-col gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={isDisabled}
          >
            <Paperclip className="size-4" />
          </Button>
          <Button type="submit" disabled={!canSubmit} size="icon">
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </form>
      <AutocompletePortal />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
    </div>
  )
}

export { ChatInput, type ChatInputProps }
