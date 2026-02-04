import type { FastifyInstance } from 'fastify'
import { sessionPersistenceService } from '@kombuse/services'
import { sessionsRepository, sessionEventsRepository } from '@kombuse/persistence'
import {
  sessionFiltersSchema,
  sessionEventFiltersSchema,
} from '../schemas/sessions'

export async function sessionRoutes(fastify: FastifyInstance) {
  // List sessions with optional filters
  fastify.get('/sessions', async (request, reply) => {
    const parseResult = sessionFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return sessionsRepository.list(parseResult.data)
  })

  // Get session by ID
  fastify.get<{
    Params: { id: string }
  }>('/sessions/:id', async (request, reply) => {
    const session = sessionsRepository.get(request.params.id)
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' })
    }
    return session
  })

  // Get session by kombuse session ID
  fastify.get<{
    Params: { kombuseSessionId: string }
  }>('/sessions/by-kombuse/:kombuseSessionId', async (request, reply) => {
    const session = sessionPersistenceService.getSessionByKombuseId(
      request.params.kombuseSessionId
    )
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' })
    }
    return session
  })

  // Get events for a session
  fastify.get<{
    Params: { id: string }
  }>('/sessions/:id/events', async (request, reply) => {
    const session = sessionsRepository.get(request.params.id)
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' })
    }

    const parseResult = sessionEventFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const { since_seq, event_type, limit } = parseResult.data

    let events = sessionEventsRepository.getBySession(
      request.params.id,
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
}
