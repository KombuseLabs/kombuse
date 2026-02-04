'use client'

import { cn } from '../../lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolUse?: { name: string; input: Record<string, unknown> }
}

interface SessionViewerProps {
  messages: Message[]
  isLoading?: boolean
  emptyMessage?: string
  className?: string
}

function SessionViewer({ messages, isLoading = false, emptyMessage = 'No messages yet', className }: SessionViewerProps) {
  if (messages.length === 0 && !isLoading) {
    return (
      <div className={cn('flex-1 flex items-center justify-center text-muted-foreground', className)}>
        {emptyMessage}
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
            message.role === 'user' ? 'bg-primary/10' : 'bg-muted'
          )}
        >
          {JSON.stringify(message, null, 2)}
        </pre>
      ))}
      {isLoading && (
        <div className="bg-muted p-3 rounded-lg text-sm">
          <span className="animate-pulse">Thinking...</span>
        </div>
      )}
    </div>
  )
}

export { SessionViewer, type SessionViewerProps, type Message }
