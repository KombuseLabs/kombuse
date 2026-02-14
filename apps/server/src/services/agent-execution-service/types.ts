import {
  agentService,
  type ISessionPersistenceService,
  type SessionStateMachine,
} from '@kombuse/services'
import type {
  AgentBackend,
  AgentEvent,
  BackendType,
  ClientMessage,
  EventWithActor,
  KombuseSessionId,
} from '@kombuse/types'

export type AgentInvokeMessage = Extract<ClientMessage, { type: 'agent.invoke' }>
export type PermissionResponseMessage = Extract<ClientMessage, { type: 'permission.response' }>

export type AgentExecutionEvent =
  | {
      type: 'started'
      kombuseSessionId: string
      ticketId?: number
      ticketTitle?: string
      agentName?: string
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

export interface AgentExecutionDependencies {
  getAgent: (agentId: string) => ReturnType<typeof agentService.getAgent>
  processEvent: (event: EventWithActor) => ReturnType<typeof agentService.processEvent>
  createBackend: (backendType: BackendType) => AgentBackend
  generateSessionId: () => KombuseSessionId
  resolveProjectPath: () => string
  resolveProjectPathForProject?: (projectId: string | null) => string | undefined
  sessionPersistence: ISessionPersistenceService
  stateMachine: SessionStateMachine
}
