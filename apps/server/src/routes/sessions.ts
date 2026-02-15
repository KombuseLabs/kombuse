import type { FastifyInstance } from 'fastify'
import type { Session, PublicSession } from '@kombuse/types'
import { BACKEND_TYPES, createSessionId } from '@kombuse/types'
import { agentsRepository, sessionsRepository, sessionEventsRepository } from '@kombuse/persistence'
import {
  createSessionSchema,
  sessionFiltersSchema,
  sessionEventFiltersSchema,
  sessionDiagnosticsQuerySchema,
} from '../schemas/sessions'
import {
  normalizeModelPreference,
  readUserDefaultBackendType,
  resolveBackendType,
  resolveConfiguredBackendType,
} from '../services/session-preferences'

function toPublicSession({ id, ...rest }: Session): PublicSession {
  const metadata = rest.metadata ?? {}
  const effectiveBackend = resolveBackendType({
    sessionBackendType:
      resolveConfiguredBackendType(metadata.effective_backend)
      ?? rest.backend_type,
    fallbackBackendType: BACKEND_TYPES.CLAUDE_CODE,
  })
  return {
    ...rest,
    effective_backend: effectiveBackend,
    model_preference: normalizeModelPreference(metadata.model_preference) ?? null,
    applied_model: normalizeModelPreference(metadata.applied_model) ?? null,
  }
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

  // Session diagnostics summary for abort investigations.
  fastify.get('/sessions/diagnostics', async (request, reply) => {
    const parseResult = sessionDiagnosticsQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return sessionsRepository.diagnostics(parseResult.data.recent_limit)
  })

  // Create a new session. By default use the session ID as kombuse_session_id
  // so frontend routing can use it directly as the stable app session key.
  fastify.post('/sessions', async (request, reply) => {
    const parseResult = createSessionSchema.safeParse(request.body ?? {})
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const agent = parseResult.data.agent_id
      ? agentsRepository.get(parseResult.data.agent_id)
      : null
    const backendTypeFromAgentConfig = resolveConfiguredBackendType(
      (agent?.config as { backend_type?: unknown } | undefined)?.backend_type
    )
    const userDefaultBackendType = readUserDefaultBackendType()
    const resolvedBackendType = resolveBackendType({
      sessionBackendType: parseResult.data.backend_type,
      agentBackendType: backendTypeFromAgentConfig,
      userDefaultBackendType,
      fallbackBackendType: BACKEND_TYPES.CLAUDE_CODE,
    })

    const modelPreference = normalizeModelPreference(parseResult.data.model_preference)

    const kombuseId = createSessionId('chat')
    const createdSession = sessionsRepository.create({
      id: crypto.randomUUID(),
      kombuse_session_id: kombuseId,
      backend_type: resolvedBackendType,
      agent_id: parseResult.data.agent_id,
      project_id: parseResult.data.project_id,
      metadata: {
        effective_backend: resolvedBackendType,
        model_preference: modelPreference ?? null,
        applied_model: null,
      },
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

    const pagedEvents = since_seq === undefined
      ? events.slice(-limit)
      : events.slice(0, limit)

    return {
      session_id: request.params.id,
      events: pagedEvents,
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
