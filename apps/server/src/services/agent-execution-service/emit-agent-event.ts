import { eventsRepository } from '@kombuse/persistence'

/**
 * Emit an agent lifecycle event for ticket activity timeline.
 * Only emits if the invocation context includes a ticket_id.
 */
export function emitAgentEvent(
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
