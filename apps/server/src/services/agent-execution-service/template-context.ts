import type { Event, TemplateContext } from '@kombuse/types'
import { buildTemplateContext } from '@kombuse/services'
import {
  agentsRepository,
  labelsRepository,
  profilesRepository,
  projectsRepository,
  ticketsRepository,
} from '@kombuse/persistence'
import { resolveDesktopContext } from './chat-session-runner'

/**
 * Input for building agent template context from raw fields (direct chat sessions).
 * Used when no Event object exists.
 */
export interface DirectContextInput {
  ticketId?: number | null
  projectId?: string | null
  kombuseSessionId: string
  backendType: string
}

/**
 * Input for building agent template context from an event (triggered sessions).
 */
export interface EventContextInput {
  event: Event
  kombuseSessionId: string
  backendType: string
}

/**
 * Build a fully-enriched TemplateContext for agent system-prompt rendering.
 *
 * Supports two modes:
 * - **Event mode**: pass `{ event }` — delegates to `buildTemplateContext()` for entity lookups.
 * - **Direct mode**: pass `{ ticketId, projectId }` — performs entity lookups inline
 *   (used by direct chat sessions that have no Event).
 *
 * Both modes append `kombuse_session_id`, `backend_type`, and `desktop_context`.
 */
export function buildAgentTemplateContext(
  input: DirectContextInput | EventContextInput
): TemplateContext {
  let context: TemplateContext

  if ('event' in input) {
    context = buildTemplateContext(input.event)
  } else {
    const { ticketId, projectId } = input

    context = {
      event_type: '',
      ticket_id: ticketId ?? null,
      ticket_number: null,
      project_id: projectId ?? null,
      comment_id: null,
      actor_id: null,
      actor_type: 'user' as const,
      payload: {} as Record<string, unknown>,
    }

    if (ticketId != null) {
      const ticket = ticketsRepository._getInternal(ticketId)
      if (ticket) {
        context.ticket_number = ticket.ticket_number
        context.ticket = {
          ...ticket,
          author: profilesRepository.get(ticket.author_id) ?? undefined,
          assignee: ticket.assignee_id
            ? profilesRepository.get(ticket.assignee_id) ?? undefined
            : undefined,
          labels: labelsRepository.getTicketLabels(ticket.id),
        }
      }
    }

    if (projectId != null) {
      context.project = projectsRepository.get(projectId)
    }

    context.agents = profilesRepository
      .list({
        type: 'agent',
        is_active: true,
        has_agent: true,
        ...(projectId ? { project_id: projectId } : {}),
      })
      .map((p) => {
        const agent = agentsRepository.get(p.id)
        return agent
          ? { id: p.id, name: p.name, description: p.description, slug: agent.slug ?? null }
          : null
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)
  }

  context.kombuse_session_id = input.kombuseSessionId
  context.backend_type = input.backendType
  context.desktop_context = resolveDesktopContext()

  return context
}
