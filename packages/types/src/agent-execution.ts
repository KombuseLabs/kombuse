import type { AgentEvent, BackendType } from './agent'
import type { ClientMessage } from './websocket'

export type AgentInvokeMessage = Extract<ClientMessage, { type: 'agent.invoke' }>
export type PermissionResponseMessage = Extract<ClientMessage, { type: 'permission.response' }>

export type AgentExecutionEvent =
  | {
      type: 'started'
      kombuseSessionId: string
      ticketId?: number
      ticketTitle?: string
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
      ticketId?: number
      status?: 'completed' | 'failed' | 'aborted' | 'stopped'
      reason?: string
      errorMessage?: string
    }
  | { type: 'error'; message: string }
