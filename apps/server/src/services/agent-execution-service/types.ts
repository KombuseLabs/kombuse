import {
  agentService,
  type ISessionPersistenceService,
  type SessionStateMachine,
} from '@kombuse/services'
import type {
  AgentBackend,
  BackendType,
  EventWithActor,
  KombuseSessionId,
} from '@kombuse/types'

// Re-export types now owned by @kombuse/types
export type { AgentInvokeMessage, PermissionResponseMessage, AgentExecutionEvent } from '@kombuse/types'

export interface AgentExecutionDependencies {
  getAgent: (agentId: string) => ReturnType<typeof agentService.getAgent>
  processEvent: (event: EventWithActor) => ReturnType<typeof agentService.processEvent>
  createBackend: (backendType: BackendType, projectId?: string) => AgentBackend
  generateSessionId: () => KombuseSessionId
  resolveProjectPath: () => string | undefined
  resolveProjectPathForProject?: (projectId: string | null) => string | undefined
  sessionPersistence: ISessionPersistenceService
  stateMachine: SessionStateMachine
}
