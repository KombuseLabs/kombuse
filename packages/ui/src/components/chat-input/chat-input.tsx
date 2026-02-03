'use client'

import { useState, useCallback, type FormEvent, type KeyboardEvent } from 'react'
import { Button } from '../../base/button'
import { Textarea } from '../../base/textarea'
import { cn } from '../../lib/utils'
import { Send, Loader2 } from 'lucide-react'

interface ChatInputProps {
  onSubmit: (message: string) => void | Promise<void>
  placeholder?: string
  isLoading?: boolean
  disabled?: boolean
  className?: string
}

function ChatInput({
  onSubmit,
  placeholder = 'Type a message...',
  isLoading = false,
  disabled = false,
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
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const isDisabled = disabled || isLoading
  const canSubmit = message.trim().length > 0 && !isDisabled

  return (
    <form onSubmit={handleSubmit} className={cn('flex gap-2 items-end', className)}>
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isDisabled}
        className="min-h-[80px] resize-none"
        rows={3}
      />
      <Button type="submit" disabled={!canSubmit} size="icon" className="shrink-0">
        {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      </Button>
    </form>
  )
}

export { ChatInput, type ChatInputProps }
