'use client'

import { useState, useCallback, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Button } from '../../base/button'
import { Textarea } from '../../base/textarea'
import { cn } from '../../lib/utils'
import { useTextareaAutocomplete } from '../../hooks/use-textarea-autocomplete'
import { useFileStaging } from '../../hooks/use-file-staging'
import { StagedFilePreviews } from '../staged-file-previews'
import { Send, Loader2, X, Paperclip, Square } from 'lucide-react'

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
  toolbarControls?: ReactNode
  replyTarget?: ReplyTarget | null
  onCancelReply?: () => void
  onStop?: () => void
  className?: string
}

function ChatInput({
  onSubmit,
  placeholder = 'Type a message...',
  isLoading = false,
  disabled = false,
  toolbarControls,
  replyTarget,
  onCancelReply,
  onStop,
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
  const { onChange: handleAutocompleteChange, onKeyDown: handleAutocompleteKeyDown } = autocompleteProps

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
      handleAutocompleteKeyDown(e)
      if (e.defaultPrevented) return

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleAutocompleteKeyDown, handleSubmit]
  )

  const isDisabled = disabled || isLoading
  const canSubmit = (message.trim().length > 0 || hasFiles) && !isDisabled

  const effectivePlaceholder = replyTarget
    ? `Reply to ${replyTarget.authorId}...`
    : placeholder

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border bg-background p-2 transition-colors',
        isDragOver && 'ring-2 ring-primary/50 bg-primary/5',
        className,
      )}
      {...dragHandlers}
    >
      {replyTarget && (
        <div className="mb-2 flex items-center gap-2 rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
          <span className="truncate">
            Replying to <span className="font-medium text-foreground">{replyTarget.authorId}</span>
            {replyTarget.isAgentSession && ' (resumes agent session)'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-4 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onCancelReply}
            aria-label="Cancel reply"
          >
            <X className="size-3" />
          </Button>
        </div>
      )}
      <StagedFilePreviews
        stagedFiles={stagedFiles}
        previewUrls={previewUrls}
        onRemove={removeFile}
        className={cn(stagedFiles.length > 0 && 'mb-2')}
      />
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={handleAutocompleteChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={effectivePlaceholder}
          disabled={isDisabled}
          className="h-20 min-h-[80px] resize-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          rows={3}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {toolbarControls}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={isDisabled}
              aria-label="Attach file"
            >
              <Paperclip className="size-4" />
            </Button>
          </div>
          <Button
            type={isLoading && onStop ? 'button' : 'submit'}
            size="icon"
            variant={isLoading && onStop ? 'destructive' : 'default'}
            className="shrink-0"
            onClick={isLoading && onStop ? onStop : undefined}
            disabled={isLoading && onStop ? false : !canSubmit}
            aria-label={isLoading && onStop ? 'Stop agent' : 'Send message'}
          >
            {isLoading && onStop ? (
              <Square className="size-3" />
            ) : isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
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
