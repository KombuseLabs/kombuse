'use client'

import { useState, useCallback, useRef, useEffect, type FormEvent, type KeyboardEvent, type DragEvent, type ClipboardEvent } from 'react'
import { Button } from '../../base/button'
import { Textarea } from '../../base/textarea'
import { cn } from '../../lib/utils'
import { Send, Loader2, X, Paperclip } from 'lucide-react'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Clean up preview URLs on unmount or when files change
  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [previewUrls])

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    const valid: File[] = []

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) continue
      if (file.size > MAX_SIZE) continue
      valid.push(file)
    }

    if (valid.length === 0) return

    setStagedFiles((prev) => [...prev, ...valid])
    setPreviewUrls((prev) => [...prev, ...valid.map((f) => URL.createObjectURL(f))])
  }, [])

  const removeFile = useCallback((index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index))
    setPreviewUrls((prev) => {
      const url = prev[index]
      if (url) URL.revokeObjectURL(url)
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault()
      const trimmed = message.trim()
      if ((!trimmed && stagedFiles.length === 0) || isLoading || disabled) return

      const filesToSend = stagedFiles.length > 0 ? [...stagedFiles] : undefined
      await onSubmit(trimmed, filesToSend)
      setMessage('')
      setStagedFiles([])
      setPreviewUrls((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url))
        return []
      })
    },
    [message, stagedFiles, isLoading, disabled, onSubmit]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }, [addFiles])

  const handlePaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData.files
    if (files.length > 0) {
      addFiles(files)
    }
  }, [addFiles])

  const handleFileInputChange = useCallback(() => {
    const input = fileInputRef.current
    if (input?.files && input.files.length > 0) {
      addFiles(input.files)
      input.value = ''
    }
  }, [addFiles])

  const isDisabled = disabled || isLoading
  const canSubmit = (message.trim().length > 0 || stagedFiles.length > 0) && !isDisabled

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
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
          value={message}
          onChange={(e) => setMessage(e.target.value)}
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
