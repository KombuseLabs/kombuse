'use client'

import { useContext, useState } from 'react'
import type { SerializedAgentEvent } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { ChatCtx } from '../../providers/chat-context'
import { useWebSocket } from '../../hooks/use-websocket'
import { ChatInput } from '../chat-input'
import { AskUserBar } from './ask-user-bar'
import { isValidAskUserInput } from './ask-user-types'
import { PlanApprovalBar } from './plan-approval-bar'
import { PermissionBar } from './permission-bar'
import { SessionHeader, type ViewMode } from './session-header'
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
  const [viewMode, setViewMode] = useState<ViewMode>('normal')
  const pendingPermission = ctx?.pendingPermission ?? null
  const respondToPermission = ctx?.respondToPermission
  const { send: wsSend } = useWebSocket({ topics: [] })

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
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        sessionId={ctx?.kombuseSessionId}
        backendSessionId={ctx?.backendSessionId}
      />
      <SessionViewer events={events} isLoading={isLoading} emptyMessage={emptyMessage} viewMode={viewMode} className="flex-1" />
      {pendingPermission && respondToPermission && (
        pendingPermission.toolName === 'AskUserQuestion' && isValidAskUserInput(pendingPermission.input as Record<string, unknown>) ? (
          <AskUserBar
            permission={pendingPermission}
            onRespond={(updatedInput) =>
              respondToPermission(pendingPermission.requestId, 'allow', undefined, updatedInput)
            }
          />
        ) : pendingPermission.toolName === 'ExitPlanMode' ? (
          <PlanApprovalBar
            permission={pendingPermission}
            onRespond={(behavior, message) =>
              respondToPermission(pendingPermission.requestId, behavior, message)
            }
          />
        ) : (
          <PermissionBar
            permission={pendingPermission}
            onRespond={(behavior, message) =>
              respondToPermission(pendingPermission.requestId, behavior, message)
            }
          />
        )
      )}
      <div className="border-t p-4">
        <ChatInput
          onSubmit={onSubmit}
          isLoading={isLoading}
          onStop={!pendingPermission && ctx?.kombuseSessionId ? () => wsSend({ type: 'agent.stop', kombuseSessionId: ctx.kombuseSessionId! }) : undefined}
        />
      </div>
    </div>
  )
}

export { Chat, type ChatProps }
