import type { AgentEvent, BackendType } from './agent.types'
import type { ClientMessage } from './websocket.types'

export type AgentInvokeMessage = Extract<ClientMessage, { type: 'agent.invoke' }>
export type PermissionResponseMessage = Extract<ClientMessage, { type: 'permission.response' }>

export type AgentExecutionEvent =
  | {
      type: 'started'
      kombuseSessionId: string
      ticketNumber?: number
      ticketTitle?: string
      projectId?: string
      agentName?: string
      effectiveBackend?: BackendType
      appliedModel?: string
      startedAt?: string
    }
  | { type: 'event'; kombuseSessionId: string; event: AgentEvent }
  | {
      type: 'complete'
      kombuseSessionId: string
      backendSessionId?: string
      ticketNumber?: number
      projectId?: string
      status?: 'completed' | 'failed' | 'aborted' | 'stopped'
      reason?: string
      errorMessage?: string
    }
  | { type: 'error'; message: string }
