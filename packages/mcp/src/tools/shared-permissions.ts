import { agentInvocationsRepository, agentsRepository, eventsRepository } from '@kombuse/persistence'
import type { Agent, AgentInvocation, PermissionCheckRequest, PermissionCheckResult, PermissionContext, Event } from '@kombuse/types'
import { agentService, readMcpAnonymousWriteAccess } from '@kombuse/services'

export function toOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length === 0) return null
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed)
    }
  }
  return null
}

export function resolvePermissionEvent(invocation: AgentInvocation): Event | undefined {
  if (typeof invocation.event_id === 'number') {
    const event = eventsRepository.get(invocation.event_id)
    if (event) return event
  }

  const context = invocation.context
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return undefined
  }

  const contextRecord = context as Record<string, unknown>
  const contextEventId = toOptionalNumber(contextRecord.event_id)
  if (contextEventId !== null) {
    const event = eventsRepository.get(contextEventId)
    if (event) return event
  }

  const contextProjectId =
    typeof contextRecord.project_id === 'string' && contextRecord.project_id.trim().length > 0
      ? contextRecord.project_id
      : invocation.project_id
  const contextTicketId = toOptionalNumber(contextRecord.ticket_id)
  const contextCommentId = toOptionalNumber(contextRecord.comment_id)

  if (!contextProjectId && contextTicketId === null && contextCommentId === null) {
    return undefined
  }

  return {
    id: contextEventId ?? invocation.event_id ?? 0,
    event_type:
      typeof contextRecord.event_type === 'string' && contextRecord.event_type.trim().length > 0
        ? contextRecord.event_type
        : 'agent.invocation',
    project_id: contextProjectId ?? null,
    ticket_id: contextTicketId,
    ticket_number: null,
    comment_id: contextCommentId,
    actor_id: null,
    actor_type: 'agent',
    kombuse_session_id: invocation.kombuse_session_id,
    payload: '{}',
    created_at: invocation.created_at,
  }
}

export function resolveAgentContext(kombuse_session_id?: string): {
  agent: Agent
  invocation: AgentInvocation
  event?: Event
} | null {
  if (!kombuse_session_id) return null

  const invocations = agentInvocationsRepository.list({ kombuse_session_id })
  if (invocations.length === 0) return null

  const invocation = invocations[0]!
  const agent = agentsRepository.get(invocation.agent_id)
  if (!agent) return null

  return {
    agent,
    invocation,
    event: resolvePermissionEvent(invocation),
  }
}

export function checkAgentPermission(
  agentContext: { agent: Agent; invocation: AgentInvocation; event?: Event } | null,
  request: PermissionCheckRequest
): PermissionCheckResult {
  if (!agentContext) {
    return { allowed: true }
  }

  const requestWithProject =
    request.projectId === undefined && agentContext.event?.project_id
      ? { ...request, projectId: agentContext.event.project_id }
      : request

  const permissionContext: PermissionContext = {
    invocation: agentContext.invocation,
    event: agentContext.event,
  }

  return agentService.checkPermission(agentContext.agent, requestWithProject, permissionContext)
}

export function permissionDeniedResponse(reason: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: `Permission denied: ${reason}` }),
      },
    ],
    isError: true,
  }
}

export function checkAnonymousWriteAccess(): PermissionCheckResult {
  const access = readMcpAnonymousWriteAccess()
  if (access === 'denied') {
    return {
      allowed: false,
      reason: 'Anonymous MCP write access is disabled. Provide a kombuse_session_id with valid agent credentials.',
    }
  }
  return { allowed: true }
}
