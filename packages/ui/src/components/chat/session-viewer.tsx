'use client'

import { cn } from '../../lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface SessionViewerProps {
  messages: Message[]
  className?: string
}

function SessionViewer({ messages, className }: SessionViewerProps) {
  if (messages.length === 0) {
    return (
      <div className={cn('flex-1 flex items-center justify-center text-muted-foreground', className)}>
        No messages yet
      </div>
    )
  }

  return (
    <div className={cn('flex-1 overflow-y-auto p-4 space-y-4', className)}>
      {messages.map((message) => (
        <pre
          key={message.id}
          className={cn(
            'p-3 rounded-lg text-sm overflow-x-auto',
            message.role === 'user'
              ? 'bg-primary/10 ml-8'
              : 'bg-muted mr-8'
          )}
        >
          {JSON.stringify(message, null, 2)}
        </pre>
      ))}
    </div>
  )
}

export { SessionViewer, type SessionViewerProps, type Message }
