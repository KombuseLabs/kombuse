'use client'

import { cn } from '../../lib/utils'
import { ChatInput } from '../chat-input'
import { SessionViewer, type Message } from './session-viewer'

interface ChatProps {
  messages: Message[]
  onSubmit: (message: string) => void | Promise<void>
  isLoading?: boolean
  className?: string
}

function Chat({ messages, onSubmit, isLoading = false, className }: ChatProps) {
  return (
    <div className={cn('flex flex-col h-full', className)}>
      <SessionViewer messages={messages} className="flex-1" />
      <div className="border-t p-4">
        <ChatInput onSubmit={onSubmit} isLoading={isLoading} />
      </div>
    </div>
  )
}

export { Chat, type ChatProps }
