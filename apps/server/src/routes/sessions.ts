import type { FastifyInstance } from 'fastify'
import { createSessionId } from '@kombuse/types'
import { sessionPersistenceService } from '@kombuse/services'
import { sessionsRepository, sessionEventsRepository } from '@kombuse/persistence'
import {
  createSessionSchema,
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
      backend_type: parseResult.data.backend_type ?? 'claude-code',
    })

    const session = sessionsRepository.update(createdSession.id, { status: 'completed' })

    return reply.status(201).send(session ?? createdSession)
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

  // Delete a session
  fastify.delete<{
    Params: { id: string }
  }>('/sessions/:id', async (request, reply) => {
    const deleted = sessionsRepository.delete(request.params.id)
    if (!deleted) {
      return reply.status(404).send({ error: 'Session not found' })
    }
    return reply.status(204).send()
  })
}
