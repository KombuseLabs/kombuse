import { statSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { agentInvocationsRepository, commentsRepository, eventsRepository, ticketsRepository } from '@kombuse/persistence'
import { buildTemplateContext, projectService, renderTemplate } from '@kombuse/services'
import { EVENT_TYPES, createSessionId, isValidSessionId, type EventWithActor, type KombuseSessionId, type ServerMessage } from '@kombuse/types'
import { wsHub } from '../../websocket/hub'
import { serializeAgentStreamEvent } from '../../websocket/serialize-agent-event'
import { broadcastTicketAgentStatus } from './backend-registry'
import { getTypePreset } from './presets'
import { startAgentChatSession } from './chat-session-runner'
import type { AgentExecutionDependencies } from './types'

/**
 * Emit an agent lifecycle event for ticket activity timeline.
 * Only emits if the invocation context includes a ticket_id.
 */
function emitAgentEvent(
  eventType: string,
  agentId: string,
  invocationId: number,
  context: Record<string, unknown>,
  additionalPayload?: Record<string, unknown>,
  kombuseSessionId?: string
): void {
  const ticketId = context.ticket_id as number | undefined
  const projectId = context.project_id as string | undefined

  if (!ticketId) {
    return
  }

  eventsRepository.create({
    event_type: eventType,
    ticket_id: ticketId,
    project_id: projectId,
    actor_id: agentId,
    actor_type: 'agent',
    kombuse_session_id: kombuseSessionId,
    payload: {
      invocation_id: invocationId,
      agent_id: agentId,
      ...additionalPayload,
    },
  })
}

/**
 * Result of building a trigger prompt — separates system prompt from user message.
 */
interface TriggerPrompt {
  /** Type preamble, rendered. Goes to --append-system-prompt. */
  systemPrompt: string
  /** Role-specific prompt + event context. Goes to initial user message. */
  userMessage: string
}

/**
 * Build a trigger prompt for a triggered agent invocation.
 * Separates type preamble (system prompt) from role instructions + event context (user message).
 */
function buildTriggerPrompt(
  event: EventWithActor,
  agent: { system_prompt: string; config: { type?: string; [key: string]: unknown } },
  kombuseSessionId: string
): TriggerPrompt {
  const templateContext = {
    ...buildTemplateContext(event),
    kombuse_session_id: kombuseSessionId,
  }

  const preset = getTypePreset(agent.config.type as string | undefined)
  const systemPrompt = preset.preambleTemplate
    ? renderTemplate(preset.preambleTemplate, templateContext)
    : ''

  const lines: string[] = []
  if (agent.system_prompt) {
    const renderedRolePrompt = renderTemplate(agent.system_prompt, templateContext)
    lines.push(renderedRolePrompt, '')
  }

  lines.push(
    `Event: ${event.event_type}`,
    `Ticket: #${event.ticket_id ?? 'N/A'}`,
    `Project: ${event.project_id ?? 'N/A'}`,
    '',
    'Payload:',
    JSON.stringify(event.payload, null, 2),
  )

  const userMessage = lines.join('\n')
  console.log('[Server] Built trigger prompt for event:', {
    eventId: event.id,
    eventType: event.event_type,
    ticketId: event.ticket_id,
    projectId: event.project_id,
    systemPromptLength: systemPrompt.length,
    userMessage,
  })

  return { systemPrompt, userMessage }
}

/**
 * Resolve a project local path if available (used for triggered invocations).
 */
export function resolveProjectPathForProject(projectId: string | null): string | undefined {
  if (!projectId) {
    return undefined
  }

  const project = projectService.get(projectId)
  const localPath = project?.local_path?.trim()

  if (!localPath) {
    return undefined
  }

  const candidatePath = resolvePath(localPath)

  try {
    if (statSync(candidatePath).isDirectory()) {
      return candidatePath
    }

    console.warn(
      `[Server] Project ${projectId} local_path is not a directory: ${candidatePath}`
    )
  } catch {
    console.warn(
      `[Server] Project ${projectId} local_path does not exist: ${candidatePath}`
    )
  }

  return undefined
}

/**
 * Resolve a deterministic default project path.
 * Uses the first project's local_path to ensure all invocations share the same cwd,
 * regardless of how the server process was started.
 * Falls back to process.cwd() only if no project has local_path configured.
 */
export function resolveDefaultProjectPath(): string {
  const projects = projectService.list()
  for (const project of projects) {
    const resolved = resolveProjectPathForProject(project.id)
    if (resolved) return resolved
  }
  return process.cwd()
}

const AGENT_LIFECYCLE_EVENTS = [
  EVENT_TYPES.AGENT_COMPLETED,
  EVENT_TYPES.AGENT_STARTED,
  EVENT_TYPES.AGENT_FAILED,
] as const

const AGENT_PASSTHROUGH_EVENTS = [
  ...AGENT_LIFECYCLE_EVENTS,
  EVENT_TYPES.MENTION_CREATED,
] as const

const MAX_CHAIN_DEPTH = 15

/**
 * Process a domain event by creating invocations and running them via chat infrastructure.
 * This ensures triggered agents have the same persistence, streaming, and permission handling as chat agents.
 */
export async function processEventAndRunAgents(
  event: EventWithActor,
  dependencies: AgentExecutionDependencies
): Promise<void> {
  console.log(
    `[Server] Processing event #${event.id} (${event.event_type}) for agent triggers...`
  )

  const isLifecycleEvent = (AGENT_LIFECYCLE_EVENTS as readonly string[]).includes(event.event_type)
  const isPassthroughEvent = (AGENT_PASSTHROUGH_EVENTS as readonly string[]).includes(event.event_type)

  if (event.actor_type !== 'user' && !isPassthroughEvent) {
    console.log(
      `[Server] Skipping non-user event #${event.id} (${event.event_type}, actor_type=${event.actor_type})`
    )
    return
  }

  if (event.kombuse_session_id && !isPassthroughEvent) {
    console.log(
      `[Server] Skipping event #${event.id} — session ${event.kombuse_session_id} already active`
    )
    return
  }

  if (typeof event.ticket_id === 'number') {
    const ticket = ticketsRepository.get(event.ticket_id)
    if (ticket && !ticket.triggers_enabled) {
      console.log(
        `[Server] Skipping event #${event.id} — triggers disabled on ticket #${event.ticket_id}`
      )
      return
    }
  }

  const invocations = dependencies.processEvent(event)

  if (invocations.length === 0) {
    return
  }

  console.log(
    `[Server] Created ${invocations.length} invocation(s), running agents via chat infrastructure...`
  )

  for (const invocation of invocations) {
    const agent = dependencies.getAgent(invocation.agent_id)
    if (!agent) {
      console.warn(`[Server] Agent ${invocation.agent_id} not found for invocation #${invocation.id}`)
      continue
    }

    const ticketId = invocation.context.ticket_id as number | undefined
    if (ticketId) {
      const maxDepth = (agent.config?.max_chain_depth as number) ?? MAX_CHAIN_DEPTH
      const recentCount = agentInvocationsRepository.countRecentByTicketId(ticketId)
      if (recentCount >= maxDepth) {
        const errorMessage = `Chain depth limit reached (${maxDepth} invocations on ticket #${ticketId} in the last hour). Halting to prevent infinite loops.`
        console.warn(`[Server] ${errorMessage}`)
        agentInvocationsRepository.update(invocation.id, {
          status: 'failed',
          error: errorMessage,
          completed_at: new Date().toISOString(),
        })
        emitAgentEvent(
          EVENT_TYPES.AGENT_FAILED,
          invocation.agent_id,
          invocation.id,
          invocation.context,
          {
            error: errorMessage,
            completing_agent_id: invocation.agent_id,
            completing_agent_type: (agent.config?.type as string) ?? 'kombuse',
          }
        )
        try {
          commentsRepository.create({
            ticket_id: ticketId,
            author_id: invocation.agent_id,
            body: `**Agent loop detected** — ${errorMessage}`,
          })
        } catch (commentError) {
          console.warn(`[Server] Failed to post chain depth comment on ticket #${ticketId}:`, commentError)
        }
        continue
      }
    }

    if (invocation.attempts >= invocation.max_attempts) {
      const errorMessage = `Invocation exceeded max attempts (${invocation.max_attempts})`
      agentInvocationsRepository.update(invocation.id, {
        status: 'failed',
        error: errorMessage,
        completed_at: new Date().toISOString(),
      })
      emitAgentEvent(
        EVENT_TYPES.AGENT_FAILED,
        invocation.agent_id,
        invocation.id,
        invocation.context,
        {
          error: errorMessage,
          completing_agent_id: invocation.agent_id,
          completing_agent_type: (agent.config?.type as string) ?? 'kombuse',
        }
      )
      continue
    }

    const lifecycleSessionId =
      typeof event.kombuse_session_id === 'string' && isValidSessionId(event.kombuse_session_id)
        ? event.kombuse_session_id
        : undefined
    const shouldReuseLifecycleSession =
      isLifecycleEvent
      && event.actor_type === 'agent'
      && typeof event.actor_id === 'string'
      && event.actor_id === invocation.agent_id
      && lifecycleSessionId !== undefined
    const kombuseSessionId: KombuseSessionId = shouldReuseLifecycleSession
      ? lifecycleSessionId
      : createSessionId('trigger')

    agentInvocationsRepository.update(invocation.id, {
      kombuse_session_id: kombuseSessionId,
      status: 'running',
      attempts: invocation.attempts + 1,
      started_at: new Date().toISOString(),
      error: null,
    })
    emitAgentEvent(
      EVENT_TYPES.AGENT_STARTED,
      invocation.agent_id,
      invocation.id,
      invocation.context,
      undefined,
      kombuseSessionId
    )

    const triggerPrompt = buildTriggerPrompt(event, agent, kombuseSessionId)
    const projectPathOverride =
      resolveProjectPathForProject(event.project_id ?? null) ??
      dependencies.resolveProjectPath()

    let invocationFailed = false
    const markFailed = (message?: string) => {
      invocationFailed = true
      agentInvocationsRepository.update(invocation.id, {
        status: 'failed',
        error: message ?? 'Agent invocation failed',
        completed_at: new Date().toISOString(),
      })
      emitAgentEvent(
        EVENT_TYPES.AGENT_FAILED,
        invocation.agent_id,
        invocation.id,
        invocation.context,
        {
          error: message ?? 'Agent invocation failed',
          completing_agent_id: invocation.agent_id,
          completing_agent_type: (agent.config?.type as string) ?? 'kombuse',
        },
        kombuseSessionId
      )
      if (ticketIdFromContext) {
        broadcastTicketAgentStatus(ticketIdFromContext)
      }
    }

    const ticketIdFromContext = invocation.context.ticket_id as number | undefined

    startAgentChatSession(
      {
        type: 'agent.invoke',
        agentId: agent.id,
        message: triggerPrompt.userMessage,
        kombuseSessionId,
      },
      (evt) => {
        if (evt.type === 'started') {
          const msg: ServerMessage = {
            type: 'agent.started',
            kombuseSessionId: evt.kombuseSessionId,
            ticketId: evt.ticketId,
            agentName: evt.agentName,
            startedAt: evt.startedAt,
          }
          wsHub.broadcastAgentMessage(evt.kombuseSessionId, msg)
          wsHub.broadcastToTopic('*', msg)
          if (evt.ticketId) {
            broadcastTicketAgentStatus(evt.ticketId)
          }
        } else if (evt.type === 'event') {
          if (evt.event.type === 'error') {
            markFailed(evt.event.message)
          }
          const serialized = serializeAgentStreamEvent(evt.event)
          if (serialized) {
            const msg: ServerMessage = {
              type: 'agent.event',
              kombuseSessionId: evt.kombuseSessionId,
              event: serialized,
            }
            wsHub.broadcastAgentMessage(evt.kombuseSessionId, msg)
          }
        } else if (evt.type === 'complete') {
          const completionFailed =
            evt.status === 'failed'
            || evt.status === 'aborted'
          if (completionFailed && !invocationFailed) {
            markFailed(evt.errorMessage ?? evt.reason ?? 'Agent invocation failed')
          }
          if (!completionFailed && !invocationFailed) {
            agentInvocationsRepository.update(invocation.id, {
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
            emitAgentEvent(
              EVENT_TYPES.AGENT_COMPLETED,
              invocation.agent_id,
              invocation.id,
              invocation.context,
              {
                completing_agent_id: invocation.agent_id,
                completing_agent_type: (agent.config?.type as string) ?? 'kombuse',
              },
              kombuseSessionId
            )
          }
          const msg: ServerMessage = {
            type: 'agent.complete',
            kombuseSessionId: evt.kombuseSessionId,
            backendSessionId: evt.backendSessionId,
            ticketId: evt.ticketId,
            status: evt.status,
            reason: evt.reason,
            errorMessage: evt.errorMessage,
          }
          wsHub.broadcastAgentMessage(evt.kombuseSessionId, msg)
          wsHub.broadcastToTopic('*', msg)
          if (evt.ticketId) {
            broadcastTicketAgentStatus(evt.ticketId)
          }
        } else if (evt.type === 'error') {
          markFailed(evt.message)
        }
      },
      dependencies,
      { projectPath: projectPathOverride, ticketId: ticketIdFromContext, systemPromptOverride: triggerPrompt.systemPrompt }
    )
  }
}
