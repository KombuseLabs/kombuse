import { agentInvocationsRepository } from '@kombuse/persistence'
import {
  agentService,
  SessionStateMachine,
  sessionPersistenceService,
} from '@kombuse/services'
import { createSessionId, EVENT_TYPES } from '@kombuse/types'
import { emitAgentEvent } from './emit-agent-event'
import { createServerAgentBackend } from './backend-factory'
import {
  cleanupOrphanedSessions,
  clearBackendIdleTimeout,
  computeTicketAgentStatus,
  configureBackendRegistry,
  getActiveSessions,
  registerBackend,
  rescheduleAllIdleTimeouts,
  resetBackendIdleTimeout,
  stopActiveCodexBackends,
  stopAgentSession,
  stopAllActiveBackends,
  unregisterBackend,
  broadcastTicketAgentStatus,
} from './backend-registry'
import { startAgentChatSession as startAgentChatSessionImpl } from './chat-session-runner'
import { getPendingPermissions, respondToPermission } from './permission-service'
import { getTypePreset, presetToAllowedTools, shouldAutoApprove, type AgentTypePreset } from '@kombuse/services'
import {
  processEventAndRunAgents as processEventAndRunAgentsImpl,
  resolveDefaultProjectPath,
  resolveProjectPathForProject,
} from './trigger-orchestrator'
import type { AgentExecutionDependencies, AgentExecutionEvent, AgentInvokeMessage } from './types'
import type { EventWithActor } from '@kombuse/types'

let defaultDependencies: AgentExecutionDependencies

const defaultStateMachine = new SessionStateMachine({
  sessionPersistence: sessionPersistenceService,
  backends: {
    register: registerBackend,
    unregister: unregisterBackend,
    resetIdleTimeout: resetBackendIdleTimeout,
    clearIdleTimeout: clearBackendIdleTimeout,
  },
  invocations: {
    markCompleted(invocationId) {
      agentInvocationsRepository.update(invocationId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
    },
    markFailed(invocationId, error) {
      agentInvocationsRepository.update(invocationId, {
        status: 'failed',
        error,
        completed_at: new Date().toISOString(),
      })
    },
    emitLifecycleEvent(invocationId, event, ctx) {
      const invocation = agentInvocationsRepository.get(invocationId)
      if (!invocation) return

      const agent = agentService.getAgent(invocation.agent_id)
      const agentType = (agent?.config as Record<string, unknown> | undefined)?.type as string ?? 'kombuse'

      const eventType = event === 'completed'
        ? EVENT_TYPES.AGENT_COMPLETED
        : EVENT_TYPES.AGENT_FAILED

      const additionalPayload: Record<string, unknown> = {
        completing_agent_id: invocation.agent_id,
        completing_agent_type: agentType,
      }
      if (event === 'failed') {
        additionalPayload.error = ctx.error ?? 'Unknown error'
      }

      emitAgentEvent(
        eventType,
        invocation.agent_id,
        invocationId,
        invocation.context,
        additionalPayload,
        ctx.kombuseSessionId
      )

      const ticketId = invocation.context.ticket_id as number | undefined
      if (ticketId) {
        broadcastTicketAgentStatus(ticketId)
      }
    },
  },
})

defaultDependencies = {
  getAgent: (agentId) => agentService.getAgent(agentId),
  processEvent: (event) => agentService.processEvent(event),
  createBackend: createServerAgentBackend,
  generateSessionId: () => createSessionId('chat'),
  resolveProjectPath: () => resolveDefaultProjectPath(),
  resolveProjectPathForProject,
  sessionPersistence: sessionPersistenceService,
  stateMachine: defaultStateMachine,
}

configureBackendRegistry({
  getDefaultStateMachine: () => defaultStateMachine,
  getDefaultDependencies: () => defaultDependencies,
})

export function processEventAndRunAgents(
  event: EventWithActor,
  dependencies: AgentExecutionDependencies = defaultDependencies
): Promise<void> {
  return processEventAndRunAgentsImpl(event, dependencies)
}

export function startAgentChatSession(
  message: AgentInvokeMessage,
  emit: (event: AgentExecutionEvent) => void,
  dependencies: AgentExecutionDependencies = defaultDependencies,
  options?: { projectPath?: string; ticketId?: number; systemPromptOverride?: string; initialInvocationId?: number }
): void {
  startAgentChatSessionImpl(message, emit, dependencies, options)
}

export {
  createServerAgentBackend,
  registerBackend,
  resetBackendIdleTimeout,
  rescheduleAllIdleTimeouts,
  stopAgentSession,
  stopAllActiveBackends,
  stopActiveCodexBackends,
  computeTicketAgentStatus,
  broadcastTicketAgentStatus,
  getActiveSessions,
  cleanupOrphanedSessions,
  getPendingPermissions,
  respondToPermission,
  getTypePreset,
  shouldAutoApprove,
  presetToAllowedTools,
}

export type {
  AgentExecutionDependencies,
  AgentExecutionEvent,
  AgentTypePreset,
}
