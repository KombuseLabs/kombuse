'use client'

import { useContext } from 'react'
import type { SerializedAgentEvent } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { ChatCtx } from '../../providers/chat-context'
import { ChatInput } from '../chat-input'
import { SessionHeader } from './session-header'
import { SessionViewer } from './session-viewer'

interface ChatProps {
  /** Events to display (optional if using ChatProvider) */
  events?: SerializedAgentEvent[]
  /** Handler for sending messages (optional if using ChatProvider) */
  onSubmit?: (message: string) => void | Promise<void>
  /** Loading state (optional if using ChatProvider) */
  isLoading?: boolean
  /** Connection state (optional if using ChatProvider) */
  isConnected?: boolean
  /** Message to show when empty */
  emptyMessage?: string
  className?: string
}

/**
 * Chat component that can be used standalone with props or inside a ChatProvider.
 * When used inside ChatProvider, props are optional and values come from context.
 */
function Chat({ events: propEvents, onSubmit: propOnSubmit, isLoading: propIsLoading, isConnected: propIsConnected, emptyMessage, className }: ChatProps) {
  const ctx = useContext(ChatCtx)

  // Use context values if available, otherwise fall back to props
  const events = propEvents ?? ctx?.events ?? []
  const onSubmit = propOnSubmit ?? ctx?.send
  const isLoading = propIsLoading ?? ctx?.isLoading ?? false
  const isConnected = propIsConnected ?? ctx?.isConnected ?? true

  const lastEventTime = events.at(-1)?.timestamp

  if (!onSubmit) {
    throw new Error('Chat requires either onSubmit prop or ChatProvider')
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <SessionHeader
        isConnected={isConnected}
        isLoading={isLoading}
        eventCount={events.length}
        lastEventTime={lastEventTime}
      />
      <SessionViewer events={events} isLoading={isLoading} emptyMessage={emptyMessage} className="flex-1" />
      <div className="border-t p-4">
        <ChatInput onSubmit={onSubmit} isLoading={isLoading} />
      </div>
    </div>
  )
}

export { Chat, type ChatProps }
