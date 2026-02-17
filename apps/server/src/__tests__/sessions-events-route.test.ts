import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { KombuseSessionId } from '@kombuse/types'
import {
  closeDatabase,
  initializeDatabase,
  setDatabase,
  sessionEventsRepository,
  sessionsRepository,
} from '@kombuse/persistence'
import { sessionRoutes } from '../routes/sessions'

interface SessionEventsResponse {
  session_id: string
  events: Array<{ seq: number; event_type: string }>
  total: number
}

function createEventPayload(seq: number) {
  return {
    type: 'message',
    eventId: `event-${seq}`,
    role: 'assistant',
    content: `message-${seq}`,
    backend: 'mock',
    timestamp: seq,
  }
}

describe('GET /sessions/:id/events route', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    const db = initializeDatabase(':memory:')
    setDatabase(db)

    app = Fastify()
    await app.register(sessionRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    closeDatabase()
  })

  it('returns the latest 100 events by default while preserving ascending order', async () => {
    const kombuseId = 'chat-default-tail' as KombuseSessionId
    const session = sessionsRepository.create({
      id: 'session-default-tail',
      kombuse_session_id: kombuseId,
    })

    sessionEventsRepository.createMany(
      Array.from({ length: 150 }, (_, index) => {
        const seq = index + 1
        return {
          session_id: session.id,
          kombuse_session_id: kombuseId,
          seq,
          event_type: 'message',
          payload: createEventPayload(seq),
        }
      })
    )

    const response = await app.inject({
      method: 'GET',
      url: '/api/sessions/chat-default-tail/events',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json() as SessionEventsResponse

    expect(body.total).toBe(150)
    expect(body.events).toHaveLength(100)
    expect(body.events[0]?.seq).toBe(51)
    expect(body.events[99]?.seq).toBe(150)
    expect(body.events.map((event) => event.seq)).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 51)
    )
  })

  it('preserves forward cursor pagination semantics when since_seq is provided', async () => {
    const kombuseId = 'chat-forward-cursor' as KombuseSessionId
    const session = sessionsRepository.create({
      id: 'session-forward-cursor',
      kombuse_session_id: kombuseId,
    })

    sessionEventsRepository.createMany(
      Array.from({ length: 150 }, (_, index) => {
        const seq = index + 1
        return {
          session_id: session.id,
          kombuse_session_id: kombuseId,
          seq,
          event_type: 'message',
          payload: createEventPayload(seq),
        }
      })
    )

    const response = await app.inject({
      method: 'GET',
      url: '/api/sessions/chat-forward-cursor/events?since_seq=120&limit=10',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json() as SessionEventsResponse

    expect(body.total).toBe(30)
    expect(body.events).toHaveLength(10)
    expect(body.events.map((event) => event.seq)).toEqual(
      Array.from({ length: 10 }, (_, index) => index + 121)
    )
  })

  it('applies event_type filtering before windowing and limit selection', async () => {
    const kombuseId = 'chat-event-type-filter' as KombuseSessionId
    const session = sessionsRepository.create({
      id: 'session-event-type-filter',
      kombuse_session_id: kombuseId,
    })

    sessionEventsRepository.createMany(
      Array.from({ length: 240 }, (_, index) => {
        const seq = index + 1
        const eventType = seq % 2 === 0 ? 'tool_result' : 'message'
        return {
          session_id: session.id,
          kombuse_session_id: kombuseId,
          seq,
          event_type: eventType,
          payload: createEventPayload(seq),
        }
      })
    )

    const defaultResponse = await app.inject({
      method: 'GET',
      url: '/api/sessions/chat-event-type-filter/events?event_type=message&limit=10',
    })

    expect(defaultResponse.statusCode).toBe(200)
    const defaultBody = defaultResponse.json() as SessionEventsResponse

    expect(defaultBody.total).toBe(120)
    expect(defaultBody.events).toHaveLength(10)
    expect(defaultBody.events.map((event) => event.seq)).toEqual([
      221,
      223,
      225,
      227,
      229,
      231,
      233,
      235,
      237,
      239,
    ])

    const sinceResponse = await app.inject({
      method: 'GET',
      url: '/api/sessions/chat-event-type-filter/events?event_type=message&since_seq=200&limit=5',
    })

    expect(sinceResponse.statusCode).toBe(200)
    const sinceBody = sinceResponse.json() as SessionEventsResponse

    expect(sinceBody.total).toBe(20)
    expect(sinceBody.events).toHaveLength(5)
    expect(sinceBody.events.map((event) => event.seq)).toEqual([201, 203, 205, 207, 209])
  })
})
