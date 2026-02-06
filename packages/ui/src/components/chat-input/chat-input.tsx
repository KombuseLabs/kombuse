'use client'

import { useState, useCallback, type FormEvent, type KeyboardEvent } from 'react'
import { Button } from '../../base/button'
import { Textarea } from '../../base/textarea'
import { cn } from '../../lib/utils'
import { Send, Loader2, X } from 'lucide-react'

export interface ReplyTarget {
  commentId: number
  authorId: string
  isAgentSession: boolean
}

interface ChatInputProps {
  onSubmit: (message: string) => void | Promise<void>
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

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault()
      const trimmed = message.trim()
      if (!trimmed || isLoading || disabled) return

      await onSubmit(trimmed)
      setMessage('')
    },
    [message, isLoading, disabled, onSubmit]
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

  const isDisabled = disabled || isLoading
  const canSubmit = message.trim().length > 0 && !isDisabled

  const effectivePlaceholder = replyTarget
    ? `Reply to ${replyTarget.authorId}...`
    : placeholder

  return (
    <div className={cn('flex flex-col gap-1', className)}>
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
      <form onSubmit={handleSubmit} className="flex gap-2 items-end">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={effectivePlaceholder}
          disabled={isDisabled}
          className="min-h-[80px] resize-none"
          rows={3}
        />
        <Button type="submit" disabled={!canSubmit} size="icon" className="shrink-0">
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </div>
  )
}

export { ChatInput, type ChatInputProps }
