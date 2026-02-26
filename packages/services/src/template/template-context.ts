import type { Event, TemplateContext } from '@kombuse/types'
import {
  ticketsRepository,
  projectsRepository,
  commentsRepository,
  profilesRepository,
  labelsRepository,
  agentsRepository,
} from '@kombuse/persistence'

/**
 * Build template context from an event.
 *
 * Fetches full entities (ticket, project, comment, actor) from the database
 * to make them available in templates.
 *
 * @example
 * const ctx = buildTemplateContext(event)
 * // ctx.ticket.title, ctx.project.name, ctx.actor.name available
 */
export function buildTemplateContext(event: Event): TemplateContext {
  // Parse payload if it's a string
  const payload =
    typeof event.payload === 'string'
      ? (JSON.parse(event.payload) as Record<string, unknown>)
      : (event.payload as Record<string, unknown>)

  // Build base context
  const context: TemplateContext = {
    event_type: event.event_type,
    ticket_id: event.ticket_id,
    ticket_number: event.ticket_number,
    project_id: event.project_id,
    comment_id: event.comment_id,
    actor_id: event.actor_id,
    actor_type: event.actor_type,
    payload,
  }

  // Fetch enriched entities
  if (event.ticket_id != null) {
    const ticket = ticketsRepository._getInternal(event.ticket_id)
    if (ticket) {
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

  if (event.project_id != null) {
    context.project = projectsRepository.get(event.project_id)
  }

  if (event.comment_id != null) {
    const comment = commentsRepository.get(event.comment_id)
    if (comment) {
      context.comment = {
        ...comment,
        author: profilesRepository.get(comment.author_id) ?? undefined,
      }
    }
  }

  if (event.actor_id != null) {
    context.actor = profilesRepository.get(event.actor_id)
  }

  // Inject active agent profiles for the mention directory (exclude orphaned profiles without agent records)
  context.agents = profilesRepository
    .list({
      type: 'agent',
      is_active: true,
      has_agent: true,
      ...(event.project_id ? { project_id: event.project_id } : {}),
    })
    .map((p) => {
      const agent = agentsRepository.get(p.id)
      return agent
        ? { id: p.id, name: p.name, description: p.description, slug: agent.slug ?? null }
        : null
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)

  return context
}
