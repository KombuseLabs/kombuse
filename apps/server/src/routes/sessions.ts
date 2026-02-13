import type { FastifyInstance } from 'fastify'
import type { Session, PublicSession } from '@kombuse/types'
import { BACKEND_TYPES, createSessionId } from '@kombuse/types'
import { sessionsRepository, sessionEventsRepository } from '@kombuse/persistence'
import {
  createSessionSchema,
  sessionFiltersSchema,
  sessionEventFiltersSchema,
} from '../schemas/sessions'

function toPublicSession({ id, ...rest }: Session): PublicSession {
  return rest
}

export async function sessionRoutes(fastify: FastifyInstance) {
  // List sessions with optional filters
  fastify.get('/sessions', async (request, reply) => {
    const parseResult = sessionFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return sessionsRepository.list(parseResult.data).map(toPublicSession)
  })

  // Create a new session. By default use the session ID as kombuse_session_id
  // so frontend routing can use it directly as the stable app session key.
  fastify.post('/sessions', async (request, reply) => {
    const parseResult = createSessionSchema.safeParse(request.body ?? {})
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const kombuseId = createSessionId('chat')
    const createdSession = sessionsRepository.create({
      id: crypto.randomUUID(),
      kombuse_session_id: kombuseId,
      backend_type: parseResult.data.backend_type ?? BACKEND_TYPES.CLAUDE_CODE,
      agent_id: parseResult.data.agent_id,
    })

    return reply.status(201).send(toPublicSession(createdSession))
  })

  // Get session by kombuse session ID
  fastify.get<{
    Params: { id: string }
  }>('/sessions/:id', async (request, reply) => {
    const session = sessionsRepository.getByKombuseSessionId(request.params.id)
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' })
    }
    return toPublicSession(session)
  })

  // Get events for a session (looked up by kombuse session ID)
  fastify.get<{
    Params: { id: string }
  }>('/sessions/:id/events', async (request, reply) => {
    const session = sessionsRepository.getByKombuseSessionId(request.params.id)
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' })
    }

    const parseResult = sessionEventFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const { since_seq, event_type, limit } = parseResult.data

    let events = sessionEventsRepository.getBySession(
      session.id,
      since_seq
    )

    if (event_type) {
      events = events.filter((e) => e.event_type === event_type)
    }

    return {
      session_id: request.params.id,
      events: events.slice(0, limit),
      total: events.length,
    }
  })

  // Delete a session (looked up by kombuse session ID)
  fastify.delete<{
    Params: { id: string }
  }>('/sessions/:id', async (request, reply) => {
    const session = sessionsRepository.getByKombuseSessionId(request.params.id)
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' })
    }
    sessionsRepository.delete(session.id)
    return reply.status(204).send()
  })
}
