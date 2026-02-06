import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { createSessionId } from '@kombuse/types'
import { setupTestDb } from '../test-utils'
import { sessionEventsRepository } from '../session-events'
import { sessionsRepository } from '../sessions'

describe('sessionEventsRepository', () => {
  let cleanup: () => void
  let db: DatabaseType
  let testSessionId: string

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    db = setup.db

    // Create a test session
    const session = sessionsRepository.create({
      kombuse_session_id: createSessionId('chat'),
      backend_type: 'mock',
    })
    testSessionId = session.id
  })

  afterEach(() => {
    cleanup()
  })

  describe('create', () => {
    it('should create a session event with required fields', () => {
      const event = sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 1,
        event_type: 'message',
        payload: { role: 'assistant', content: 'Hello' },
      })

      expect(event.id).toBeDefined()
      expect(event.session_id).toBe(testSessionId)
      expect(event.seq).toBe(1)
      expect(event.event_type).toBe('message')
      expect(event.payload).toEqual({ role: 'assistant', content: 'Hello' })
      expect(event.created_at).toBeDefined()
    })

    it('should store complex payload as JSON', () => {
      const event = sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 1,
        event_type: 'tool_use',
        payload: {
          id: 'tool-123',
          name: 'read_file',
          input: { path: '/foo/bar.txt', encoding: 'utf-8' },
        },
      })

      expect(event.payload).toEqual({
        id: 'tool-123',
        name: 'read_file',
        input: { path: '/foo/bar.txt', encoding: 'utf-8' },
      })
    })
  })

  describe('get', () => {
    it('should get event by ID', () => {
      const created = sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 1,
        event_type: 'message',
        payload: { content: 'test' },
      })

      const event = sessionEventsRepository.get(created.id)
      expect(event).not.toBeNull()
      expect(event?.id).toBe(created.id)
    })

    it('should return null for non-existent ID', () => {
      const event = sessionEventsRepository.get(99999)
      expect(event).toBeNull()
    })
  })

  describe('getBySession', () => {
    it('should return events in sequence order', () => {
      // Insert out of order
      sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 2,
        event_type: 'tool_use',
        payload: { name: 'read_file' },
      })
      sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 1,
        event_type: 'message',
        payload: { content: 'First' },
      })
      sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 3,
        event_type: 'tool_result',
        payload: { content: 'Result' },
      })

      const events = sessionEventsRepository.getBySession(testSessionId)

      expect(events).toHaveLength(3)
      expect(events[0]?.seq).toBe(1)
      expect(events[1]?.seq).toBe(2)
      expect(events[2]?.seq).toBe(3)
    })

    it('should filter events since a sequence number', () => {
      sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 1,
        event_type: 'message',
        payload: {},
      })
      sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 2,
        event_type: 'message',
        payload: {},
      })
      sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 3,
        event_type: 'message',
        payload: {},
      })

      const events = sessionEventsRepository.getBySession(testSessionId, 1)

      expect(events).toHaveLength(2)
      expect(events[0]?.seq).toBe(2)
      expect(events[1]?.seq).toBe(3)
    })

    it('should return empty array for session with no events', () => {
      const events = sessionEventsRepository.getBySession(testSessionId)
      expect(events).toHaveLength(0)
    })

    it('should only return events for the specified session', () => {
      // Create another session
      const otherSession = sessionsRepository.create({
        kombuse_session_id: createSessionId('chat'),
        backend_type: 'mock',
      })

      sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 1,
        event_type: 'message',
        payload: { content: 'Session 1' },
      })
      sessionEventsRepository.create({
        session_id: otherSession.id,
        seq: 1,
        event_type: 'message',
        payload: { content: 'Session 2' },
      })

      const events = sessionEventsRepository.getBySession(testSessionId)
      expect(events).toHaveLength(1)
      expect(events[0]?.payload).toEqual({ content: 'Session 1' })
    })
  })

  describe('list', () => {
    beforeEach(() => {
      sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 1,
        event_type: 'message',
        payload: {},
      })
      sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 2,
        event_type: 'tool_use',
        payload: {},
      })
      sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 3,
        event_type: 'tool_result',
        payload: {},
      })
    })

    it('should filter by event_type', () => {
      const events = sessionEventsRepository.list({ event_type: 'tool_use' })
      expect(events).toHaveLength(1)
      expect(events[0]?.event_type).toBe('tool_use')
    })

    it('should filter by session_id', () => {
      const events = sessionEventsRepository.list({ session_id: testSessionId })
      expect(events).toHaveLength(3)
    })

    it('should respect limit and offset', () => {
      const events = sessionEventsRepository.list({
        session_id: testSessionId,
        limit: 2,
        offset: 1,
      })
      expect(events).toHaveLength(2)
      expect(events[0]?.seq).toBe(2)
      expect(events[1]?.seq).toBe(3)
    })
  })

  describe('createMany', () => {
    it('should bulk insert events', () => {
      const count = sessionEventsRepository.createMany([
        { session_id: testSessionId, seq: 1, event_type: 'message', payload: { n: 1 } },
        { session_id: testSessionId, seq: 2, event_type: 'message', payload: { n: 2 } },
        { session_id: testSessionId, seq: 3, event_type: 'message', payload: { n: 3 } },
      ])

      expect(count).toBe(3)

      const events = sessionEventsRepository.getBySession(testSessionId)
      expect(events).toHaveLength(3)
    })
  })

  describe('getNextSeq', () => {
    it('should return 1 for empty session', () => {
      const nextSeq = sessionEventsRepository.getNextSeq(testSessionId)
      expect(nextSeq).toBe(1)
    })

    it('should return max + 1 for session with events', () => {
      sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 5,
        event_type: 'message',
        payload: {},
      })

      const nextSeq = sessionEventsRepository.getNextSeq(testSessionId)
      expect(nextSeq).toBe(6)
    })

    it('should handle gaps in sequence numbers', () => {
      sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 1,
        event_type: 'message',
        payload: {},
      })
      sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 10,
        event_type: 'message',
        payload: {},
      })

      const nextSeq = sessionEventsRepository.getNextSeq(testSessionId)
      expect(nextSeq).toBe(11)
    })
  })

  describe('deleteBySession', () => {
    it('should delete all events for a session', () => {
      sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 1,
        event_type: 'message',
        payload: {},
      })
      sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 2,
        event_type: 'message',
        payload: {},
      })

      const deletedCount = sessionEventsRepository.deleteBySession(testSessionId)
      expect(deletedCount).toBe(2)

      const events = sessionEventsRepository.getBySession(testSessionId)
      expect(events).toHaveLength(0)
    })

    it('should return 0 for session with no events', () => {
      const deletedCount = sessionEventsRepository.deleteBySession(testSessionId)
      expect(deletedCount).toBe(0)
    })

    it('should not affect other sessions', () => {
      const otherSession = sessionsRepository.create({
        kombuse_session_id: createSessionId('chat'),
        backend_type: 'mock',
      })

      sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 1,
        event_type: 'message',
        payload: {},
      })
      sessionEventsRepository.create({
        session_id: otherSession.id,
        seq: 1,
        event_type: 'message',
        payload: {},
      })

      sessionEventsRepository.deleteBySession(testSessionId)

      const otherEvents = sessionEventsRepository.getBySession(otherSession.id)
      expect(otherEvents).toHaveLength(1)
    })
  })

  describe('cascade delete', () => {
    it('should delete events when session is deleted', () => {
      sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 1,
        event_type: 'message',
        payload: {},
      })

      sessionsRepository.delete(testSessionId)

      const events = sessionEventsRepository.getBySession(testSessionId)
      expect(events).toHaveLength(0)
    })
  })
})

describe('sessionsRepository enhancements', () => {
  let cleanup: () => void
  let db: DatabaseType

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    db = setup.db
  })

  afterEach(() => {
    cleanup()
  })

  describe('update', () => {
    it('should update status', () => {
      const session = sessionsRepository.create({
        kombuse_session_id: createSessionId('chat'),
        backend_type: 'mock',
      })

      const updated = sessionsRepository.update(session.id, {
        status: 'completed',
      })

      expect(updated?.status).toBe('completed')
    })

    it('should update backend_session_id', () => {
      const session = sessionsRepository.create({
        kombuse_session_id: createSessionId('chat'),
        backend_type: 'claude-code',
      })

      const updated = sessionsRepository.update(session.id, {
        backend_session_id: 'backend-123',
      })

      expect(updated?.backend_session_id).toBe('backend-123')
    })

    it('should update last_event_seq', () => {
      const session = sessionsRepository.create({
        kombuse_session_id: createSessionId('chat'),
      })

      const updated = sessionsRepository.update(session.id, {
        last_event_seq: 42,
      })

      expect(updated?.last_event_seq).toBe(42)
    })

    it('should update multiple fields at once', () => {
      const session = sessionsRepository.create({
        kombuse_session_id: createSessionId('chat'),
      })

      const updated = sessionsRepository.update(session.id, {
        status: 'completed',
        completed_at: '2025-01-01T00:00:00Z',
        last_event_seq: 10,
      })

      expect(updated?.status).toBe('completed')
      expect(updated?.completed_at).toBe('2025-01-01T00:00:00Z')
      expect(updated?.last_event_seq).toBe(10)
    })

    it('should return unchanged session when no fields provided', () => {
      const session = sessionsRepository.create({
        kombuse_session_id: createSessionId('chat'),
      })

      const updated = sessionsRepository.update(session.id, {})

      expect(updated?.id).toBe(session.id)
    })

    it('should return null for non-existent session', () => {
      const updated = sessionsRepository.update('non-existent-id', {
        status: 'completed',
      })

      expect(updated).toBeNull()
    })
  })

  describe('getByKombuseSessionId', () => {
    it('should find session by kombuse session ID', () => {
      const kombuseId = createSessionId('chat')
      sessionsRepository.create({
        kombuse_session_id: kombuseId,
        backend_type: 'mock',
      })

      const session = sessionsRepository.getByKombuseSessionId(kombuseId)

      expect(session).not.toBeNull()
      expect(session?.kombuse_session_id).toBe(kombuseId)
    })

    it('should return null for non-existent kombuse session ID', () => {
      const session = sessionsRepository.getByKombuseSessionId(createSessionId('chat'))
      expect(session).toBeNull()
    })
  })
})
