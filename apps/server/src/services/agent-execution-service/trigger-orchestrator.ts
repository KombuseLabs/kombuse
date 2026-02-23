import { statSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { agentInvocationsRepository, commentsRepository, sessionsRepository, ticketsRepository } from '@kombuse/persistence'
import { buildTemplateContext, MAX_CHAIN_DEPTH, projectService, readUserDefaultMaxChainDepth, renderTemplateWithIncludes } from '@kombuse/services'
import { EVENT_TYPES, createSessionId, isValidSessionId, type EventWithActor, type KombuseSessionId, type ServerMessage } from '@kombuse/types'
import { wsHub } from '../../websocket/hub'
import { serializeAgentStreamEvent } from '../../websocket/serialize-agent-event'
import { broadcastTicketAgentStatus } from './backend-registry'
import { readAgentsMd, startAgentChatSession } from './chat-session-runner'
import { emitAgentEvent } from './emit-agent-event'
import type { AgentExecutionDependencies } from './types'

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
  agent: { system_prompt: string; plugin_id: string | null; config: { type?: string; [key: string]: unknown } },
  kombuseSessionId: string
): TriggerPrompt {
  const templateContext = {
    ...buildTemplateContext(event),
    kombuse_session_id: kombuseSessionId,
  }

  const systemPrompt = agent.system_prompt
    ? renderTemplateWithIncludes(agent.system_prompt, templateContext, agent.plugin_id)
    : ''

  const lines: string[] = []
  lines.push(
    `Event: ${event.event_type}`,
    `Ticket: #${event.ticket_number ?? event.ticket_id ?? 'N/A'}`,
    `Project: ${event.project_id ?? 'N/A'}`,
    '',
    'Payload:',
    JSON.stringify(event.payload, null, 2),
  )

  const userMessage = lines.join('\n')
  /** For debugging trigger prompt construction — can be verbose, so only log for events that create invocations. */
 /*
  console.log('[Server] Built trigger prompt for event:', {
    eventId: event.id,
    eventType: event.event_type,
    ticketId: event.ticket_id,
    projectId: event.project_id,
    systemPromptLength: systemPrompt.length,
    userMessage,
  })
  */

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
  // Iterate oldest-first so the fallback path is stable when new projects are added
  for (let i = projects.length - 1; i >= 0; i--) {
    const project = projects[i]
    if (!project) continue
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

/**
 * Process a domain event by creating invocations and running them via chat infrastructure.
 * This ensures triggered agents have the same persistence, streaming, and permission handling as chat agents.
 */
export async function processEventAndRunAgents(
  event: EventWithActor,
  dependencies: AgentExecutionDependencies
): Promise<void> {

  const isLifecycleEvent = (AGENT_LIFECYCLE_EVENTS as readonly string[]).includes(event.event_type)
  const isPassthroughEvent = (AGENT_PASSTHROUGH_EVENTS as readonly string[]).includes(event.event_type)

  if (event.actor_type !== 'user' && !isPassthroughEvent) {
    return
  }

  if (event.kombuse_session_id && !isPassthroughEvent) {
    console.log(
      `[Server] Skipping event #${event.id} — session ${event.kombuse_session_id} already active`
    )
    return
  }

  if (typeof event.ticket_id === 'number') {
    const ticket = ticketsRepository._getInternal(event.ticket_id)
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
      const ticket = ticketsRepository._getInternal(ticketId)
      if (ticket?.loop_protection_enabled !== false) {
        const maxDepth = agent.config?.max_chain_depth ?? readUserDefaultMaxChainDepth() ?? MAX_CHAIN_DEPTH
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
    }

    // Dedup guard: skip if same agent already active on this ticket
    if (ticketId) {
      const existingActive = agentInvocationsRepository.findActiveByAgentAndTicket(
        invocation.agent_id,
        ticketId
      )
      if (existingActive && existingActive.id !== invocation.id) {
        const errorMessage = `Skipped: agent ${invocation.agent_id} already has active invocation #${existingActive.id} on ticket #${ticketId}`
        console.log(`[Server] ${errorMessage}`)
        agentInvocationsRepository.update(invocation.id, {
          status: 'failed',
          error: errorMessage,
          completed_at: new Date().toISOString(),
        })
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

    // For profile mentions, try to find an existing session to continue
    const mentionPayload = typeof event.payload === 'object' ? event.payload as Record<string, unknown> : null
    const isMentionProfileEvent =
      event.event_type === EVENT_TYPES.MENTION_CREATED
      && mentionPayload?.mention_type === 'profile'
    let mentionResolvedSessionId: KombuseSessionId | undefined
    if (isMentionProfileEvent && ticketId) {
      const eligible = sessionsRepository.findMostRecentForTicketAgent(ticketId, invocation.agent_id)
      if (eligible?.kombuse_session_id && isValidSessionId(eligible.kombuse_session_id)) {
        mentionResolvedSessionId = eligible.kombuse_session_id
        console.log(
          `[Server] Mention session resolution: reusing session ${mentionResolvedSessionId} ` +
          `(status=${eligible.status}) for agent ${invocation.agent_id} on ticket #${ticketId}`
        )
      }
    }

    const kombuseSessionId: KombuseSessionId = shouldReuseLifecycleSession
      ? lifecycleSessionId
      : mentionResolvedSessionId ?? createSessionId('trigger')

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

    const agentsMdContent = readAgentsMd(projectPathOverride)
    if (agentsMdContent) {
      triggerPrompt.systemPrompt += `\n\n## Project Agent Instructions (AGENTS.md)\n${agentsMdContent}`
    }

    const ticketIdFromContext = invocation.context.ticket_id as number | undefined

    startAgentChatSession(
      {
        type: 'agent.invoke',
        agentId: agent.id,
        message: triggerPrompt.userMessage,
        kombuseSessionId,
        projectId: event.project_id ?? undefined,
      },
      (evt) => {
        if (evt.type === 'started') {
          const msg: ServerMessage = {
            type: 'agent.started',
            kombuseSessionId: evt.kombuseSessionId,
            ticketNumber: evt.ticketNumber,
            ticketTitle: evt.ticketTitle,
            projectId: evt.projectId,
            agentName: evt.agentName,
            effectiveBackend: evt.effectiveBackend,
            appliedModel: evt.appliedModel,
            startedAt: evt.startedAt,
          }
          wsHub.broadcastAgentMessage(evt.kombuseSessionId, msg)
          wsHub.broadcastToTopic('*', msg)
          if (ticketIdFromContext) {
            broadcastTicketAgentStatus(ticketIdFromContext)
          }
        } else if (evt.type === 'event') {
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
          // Invocation status updates and domain event emission are now handled
          // by the state machine via emitLifecycleEvent. This callback only
          // handles WebSocket broadcasts.
          const msg: ServerMessage = {
            type: 'agent.complete',
            kombuseSessionId: evt.kombuseSessionId,
            backendSessionId: evt.backendSessionId,
            ticketNumber: evt.ticketNumber,
            projectId: evt.projectId,
            status: evt.status,
            reason: evt.reason,
            errorMessage: evt.errorMessage,
          }
          wsHub.broadcastAgentMessage(evt.kombuseSessionId, msg)
          wsHub.broadcastToTopic('*', msg)
          if (ticketIdFromContext) {
            broadcastTicketAgentStatus(ticketIdFromContext)
          }
        }
      },
      dependencies,
      { projectPath: projectPathOverride, ticketId: ticketIdFromContext, systemPromptOverride: triggerPrompt.systemPrompt, initialInvocationId: invocation.id }
    )
  }
}
