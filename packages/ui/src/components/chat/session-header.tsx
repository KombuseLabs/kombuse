'use client'

import { cn } from '../../lib/utils'

interface SessionHeaderProps {
  isConnected?: boolean
  isLoading?: boolean
  messageCount: number
  className?: string
}

function SessionHeader({ isConnected = true, isLoading = false, messageCount, className }: SessionHeaderProps) {
  return (
    <div className={cn('flex items-center gap-3 px-4 py-2 border-b text-sm text-muted-foreground', className)}>
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'size-2 rounded-full',
            isConnected ? 'bg-green-500' : 'bg-red-500'
          )}
        />
        <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
      </div>

      <div className="w-px h-4 bg-border" />

      <div className="flex items-center gap-1.5">
        {isLoading ? (
          <>
            <span className="size-2 rounded-full bg-yellow-500 animate-pulse" />
            <span>Running</span>
          </>
        ) : (
          <>
            <span className="size-2 rounded-full bg-muted-foreground/50" />
            <span>Idle</span>
          </>
        )}
      </div>

      <div className="w-px h-4 bg-border" />

      <span>{messageCount} {messageCount === 1 ? 'message' : 'messages'}</span>
    </div>
  )
}

export { SessionHeader, type SessionHeaderProps }
