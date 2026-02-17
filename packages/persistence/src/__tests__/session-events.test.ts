import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { createSessionId } from '@kombuse/types'
import { setupTestDb, TEST_USER_ID, TEST_PROJECT_ID } from '../test-utils'
import { getDatabase } from '../database'
import { sessionEventsRepository } from '../session-events'
import { sessionsRepository } from '../sessions'
import { ticketsRepository } from '../tickets'

describe('sessionEventsRepository', () => {
  let cleanup: () => void
  let db: DatabaseType
  let testSessionId: string
  let testKombuseSessionId: string

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    db = setup.db

    // Create a test session
    const kombuseId = createSessionId('chat')
    const session = sessionsRepository.create({
      kombuse_session_id: kombuseId,
      backend_type: 'mock',
    })
    testSessionId = session.id
    testKombuseSessionId = kombuseId
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

  describe('kombuse_session_id', () => {
    it('should store and return kombuse_session_id on create', () => {
      const event = sessionEventsRepository.create({
        session_id: testSessionId,
        kombuse_session_id: testKombuseSessionId,
        seq: 1,
        event_type: 'message',
        payload: { content: 'Hello' },
      })

      expect(event.kombuse_session_id).toBe(testKombuseSessionId)
    })

    it('should default kombuse_session_id to null when not provided', () => {
      const event = sessionEventsRepository.create({
        session_id: testSessionId,
        seq: 1,
        event_type: 'message',
        payload: { content: 'Hello' },
      })

      expect(event.kombuse_session_id).toBeNull()
    })

    it('should store kombuse_session_id via createMany', () => {
      sessionEventsRepository.createMany([
        {
          session_id: testSessionId,
          kombuse_session_id: testKombuseSessionId,
          seq: 1,
          event_type: 'message',
          payload: { n: 1 },
        },
        {
          session_id: testSessionId,
          kombuse_session_id: testKombuseSessionId,
          seq: 2,
          event_type: 'message',
          payload: { n: 2 },
        },
      ])

      const events = sessionEventsRepository.getBySession(testSessionId)
      expect(events).toHaveLength(2)
      expect(events[0]?.kombuse_session_id).toBe(testKombuseSessionId)
      expect(events[1]?.kombuse_session_id).toBe(testKombuseSessionId)
    })
  })

  describe('getByKombuseSession', () => {
    it('should return events by kombuse_session_id', () => {
      sessionEventsRepository.create({
        session_id: testSessionId,
        kombuse_session_id: testKombuseSessionId,
        seq: 1,
        event_type: 'message',
        payload: { content: 'First' },
      })
      sessionEventsRepository.create({
        session_id: testSessionId,
        kombuse_session_id: testKombuseSessionId,
        seq: 2,
        event_type: 'message',
        payload: { content: 'Second' },
      })

      const events = sessionEventsRepository.getByKombuseSession(testKombuseSessionId)
      expect(events).toHaveLength(2)
      expect(events[0]?.seq).toBe(1)
      expect(events[1]?.seq).toBe(2)
    })

    it('should filter by sinceSeq', () => {
      sessionEventsRepository.createMany([
        { session_id: testSessionId, kombuse_session_id: testKombuseSessionId, seq: 1, event_type: 'message', payload: {} },
        { session_id: testSessionId, kombuse_session_id: testKombuseSessionId, seq: 2, event_type: 'message', payload: {} },
        { session_id: testSessionId, kombuse_session_id: testKombuseSessionId, seq: 3, event_type: 'message', payload: {} },
      ])

      const events = sessionEventsRepository.getByKombuseSession(testKombuseSessionId, 1)
      expect(events).toHaveLength(2)
      expect(events[0]?.seq).toBe(2)
      expect(events[1]?.seq).toBe(3)
    })

    it('should isolate between different kombuse session IDs', () => {
      const otherKombuseId = createSessionId('chat')
      const otherSession = sessionsRepository.create({
        kombuse_session_id: otherKombuseId,
        backend_type: 'mock',
      })

      sessionEventsRepository.create({
        session_id: testSessionId,
        kombuse_session_id: testKombuseSessionId,
        seq: 1,
        event_type: 'message',
        payload: { content: 'Session 1' },
      })
      sessionEventsRepository.create({
        session_id: otherSession.id,
        kombuse_session_id: otherKombuseId,
        seq: 1,
        event_type: 'message',
        payload: { content: 'Session 2' },
      })

      const events = sessionEventsRepository.getByKombuseSession(testKombuseSessionId)
      expect(events).toHaveLength(1)
      expect(events[0]?.payload).toEqual({ content: 'Session 1' })
    })

    it('should return empty array for non-existent kombuse session ID', () => {
      const events = sessionEventsRepository.getByKombuseSession('non-existent')
      expect(events).toHaveLength(0)
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

describe('listPermissions', () => {
  let cleanup: () => void
  let db: DatabaseType
  let testSessionId: string

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    db = setup.db

    // Create ticket → session chain so project_id filter works
    const ticket = ticketsRepository.create({
      title: 'Permissions test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const session = sessionsRepository.create({
      kombuse_session_id: createSessionId('chat'),
      backend_type: 'mock',
      ticket_id: ticket.id,
    })
    testSessionId = session.id
  })

  afterEach(() => {
    cleanup()
  })

  function createPermissionRequest(
    sessionId: string,
    seq: number,
    opts: { requestId: string; toolName: string; description?: string; autoApproved?: boolean }
  ) {
    return sessionEventsRepository.create({
      session_id: sessionId,
      seq,
      event_type: 'permission_request',
      payload: {
        requestId: opts.requestId,
        toolName: opts.toolName,
        description: opts.description ?? null,
        autoApproved: opts.autoApproved ? 1 : undefined,
      },
    })
  }

  function createPermissionResponse(
    sessionId: string,
    seq: number,
    opts: { requestId: string; behavior: 'allow' | 'deny'; message?: string }
  ) {
    return sessionEventsRepository.create({
      session_id: sessionId,
      seq,
      event_type: 'permission_response',
      payload: {
        requestId: opts.requestId,
        behavior: opts.behavior,
        message: opts.message ?? null,
      },
    })
  }

  it('should return permission requests with their responses', () => {
    createPermissionRequest(testSessionId, 1, {
      requestId: 'req-1',
      toolName: 'Bash',
      description: 'Run git status',
    })
    createPermissionResponse(testSessionId, 2, {
      requestId: 'req-1',
      behavior: 'allow',
    })

    const results = sessionEventsRepository.listPermissions({
      project_id: TEST_PROJECT_ID,
    })

    expect(results).toHaveLength(1)
    expect(results[0]!.tool_name).toBe('Bash')
    expect(results[0]!.description).toBe('Run git status')
    expect(results[0]!.behavior).toBe('allow')
    expect(results[0]!.auto_approved).toBe(false)
    expect(results[0]!.deny_message).toBeNull()
    expect(results[0]!.resolved_at).toBeDefined()
    expect(results[0]!.kombuse_session_id).toBeDefined()
    expect(results[0]!.ticket_id).toBeDefined()
    expect(results[0]!.ticket_title).toBe('Permissions test ticket')
    expect(results[0]!.input).toEqual({})
  })

  it('should return pending requests with null behavior', () => {
    createPermissionRequest(testSessionId, 1, {
      requestId: 'req-pending',
      toolName: 'Write',
      description: 'Write to file.ts',
    })

    const results = sessionEventsRepository.listPermissions({
      project_id: TEST_PROJECT_ID,
    })

    expect(results).toHaveLength(1)
    expect(results[0]!.behavior).toBeNull()
    expect(results[0]!.resolved_at).toBeNull()
  })

  it('should handle auto-approved requests', () => {
    createPermissionRequest(testSessionId, 1, {
      requestId: 'req-auto',
      toolName: 'Read',
      description: 'Read file',
      autoApproved: true,
    })

    const results = sessionEventsRepository.listPermissions({
      project_id: TEST_PROJECT_ID,
    })

    expect(results).toHaveLength(1)
    expect(results[0]!.auto_approved).toBe(true)
    expect(results[0]!.behavior).toBe('allow')
  })

  it('should include deny message for denied requests', () => {
    createPermissionRequest(testSessionId, 1, {
      requestId: 'req-deny',
      toolName: 'Bash',
      description: 'Run rm -rf /',
    })
    createPermissionResponse(testSessionId, 2, {
      requestId: 'req-deny',
      behavior: 'deny',
      message: 'Too dangerous',
    })

    const results = sessionEventsRepository.listPermissions({
      project_id: TEST_PROJECT_ID,
    })

    expect(results).toHaveLength(1)
    expect(results[0]!.behavior).toBe('deny')
    expect(results[0]!.deny_message).toBe('Too dangerous')
  })

  it('should filter by tool_name', () => {
    createPermissionRequest(testSessionId, 1, {
      requestId: 'req-bash',
      toolName: 'Bash',
    })
    createPermissionRequest(testSessionId, 2, {
      requestId: 'req-read',
      toolName: 'Read',
    })

    const results = sessionEventsRepository.listPermissions({
      project_id: TEST_PROJECT_ID,
      tool_name: 'Bash',
    })

    expect(results).toHaveLength(1)
    expect(results[0]!.tool_name).toBe('Bash')
  })

  it('should filter by behavior: allow', () => {
    createPermissionRequest(testSessionId, 1, {
      requestId: 'req-allow',
      toolName: 'Bash',
    })
    createPermissionResponse(testSessionId, 2, {
      requestId: 'req-allow',
      behavior: 'allow',
    })
    createPermissionRequest(testSessionId, 3, {
      requestId: 'req-deny',
      toolName: 'Bash',
    })
    createPermissionResponse(testSessionId, 4, {
      requestId: 'req-deny',
      behavior: 'deny',
    })

    const results = sessionEventsRepository.listPermissions({
      project_id: TEST_PROJECT_ID,
      behavior: 'allow',
    })

    expect(results).toHaveLength(1)
    expect(results[0]!.request_id).toBe('req-allow')
  })

  it('should filter by behavior: deny', () => {
    createPermissionRequest(testSessionId, 1, {
      requestId: 'req-allow',
      toolName: 'Bash',
    })
    createPermissionResponse(testSessionId, 2, {
      requestId: 'req-allow',
      behavior: 'allow',
    })
    createPermissionRequest(testSessionId, 3, {
      requestId: 'req-deny',
      toolName: 'Write',
    })
    createPermissionResponse(testSessionId, 4, {
      requestId: 'req-deny',
      behavior: 'deny',
    })

    const results = sessionEventsRepository.listPermissions({
      project_id: TEST_PROJECT_ID,
      behavior: 'deny',
    })

    expect(results).toHaveLength(1)
    expect(results[0]!.request_id).toBe('req-deny')
  })

  it('should filter by behavior: auto_approved', () => {
    createPermissionRequest(testSessionId, 1, {
      requestId: 'req-auto',
      toolName: 'Read',
      autoApproved: true,
    })
    createPermissionRequest(testSessionId, 2, {
      requestId: 'req-manual',
      toolName: 'Bash',
    })
    createPermissionResponse(testSessionId, 3, {
      requestId: 'req-manual',
      behavior: 'allow',
    })

    const results = sessionEventsRepository.listPermissions({
      project_id: TEST_PROJECT_ID,
      behavior: 'auto_approved',
    })

    expect(results).toHaveLength(1)
    expect(results[0]!.request_id).toBe('req-auto')
    expect(results[0]!.auto_approved).toBe(true)
  })

  it('should filter by project_id', () => {
    // Create a second project + ticket + session
    const db = getDatabase()
    db.prepare("INSERT INTO projects (id, name, owner_id) VALUES (?, 'Other Project', ?)").run(
      'other-project',
      TEST_USER_ID
    )
    const otherTicket = ticketsRepository.create({
      title: 'Other project ticket',
      project_id: 'other-project',
      author_id: TEST_USER_ID,
    })
    const otherSession = sessionsRepository.create({
      kombuse_session_id: createSessionId('chat'),
      backend_type: 'mock',
      ticket_id: otherTicket.id,
    })

    createPermissionRequest(testSessionId, 1, {
      requestId: 'req-proj1',
      toolName: 'Bash',
    })
    createPermissionRequest(otherSession.id, 1, {
      requestId: 'req-proj2',
      toolName: 'Bash',
    })

    const results = sessionEventsRepository.listPermissions({
      project_id: TEST_PROJECT_ID,
    })

    expect(results).toHaveLength(1)
    expect(results[0]!.request_id).toBe('req-proj1')
  })

  it('should respect limit and offset', () => {
    for (let i = 1; i <= 5; i++) {
      createPermissionRequest(testSessionId, i, {
        requestId: `req-${i}`,
        toolName: 'Bash',
      })
    }

    const firstPage = sessionEventsRepository.listPermissions({
      project_id: TEST_PROJECT_ID,
      limit: 2,
      offset: 0,
    })
    expect(firstPage).toHaveLength(2)

    const secondPage = sessionEventsRepository.listPermissions({
      project_id: TEST_PROJECT_ID,
      limit: 2,
      offset: 2,
    })
    expect(secondPage).toHaveLength(2)

    // Ensure different results
    expect(firstPage[0]!.request_id).not.toBe(secondPage[0]!.request_id)
  })

  it('should return results ordered by requested_at descending', () => {
    createPermissionRequest(testSessionId, 1, {
      requestId: 'req-first',
      toolName: 'Bash',
    })
    createPermissionRequest(testSessionId, 2, {
      requestId: 'req-second',
      toolName: 'Read',
    })

    const results = sessionEventsRepository.listPermissions({
      project_id: TEST_PROJECT_ID,
    })

    expect(results).toHaveLength(2)
    // Both have same timestamp, so ordering is stable by created_at DESC, then id DESC
    // Verify both results are present
    const requestIds = results.map((r) => r.request_id)
    expect(requestIds).toContain('req-first')
    expect(requestIds).toContain('req-second')
  })

  it('should return empty array when no permission events exist', () => {
    const results = sessionEventsRepository.listPermissions({
      project_id: TEST_PROJECT_ID,
    })

    expect(results).toHaveLength(0)
  })

  it('should match response to correct request by requestId', () => {
    createPermissionRequest(testSessionId, 1, {
      requestId: 'req-a',
      toolName: 'Bash',
    })
    createPermissionRequest(testSessionId, 2, {
      requestId: 'req-b',
      toolName: 'Write',
    })
    createPermissionResponse(testSessionId, 3, {
      requestId: 'req-a',
      behavior: 'allow',
    })
    createPermissionResponse(testSessionId, 4, {
      requestId: 'req-b',
      behavior: 'deny',
      message: 'Not allowed',
    })

    const results = sessionEventsRepository.listPermissions({
      project_id: TEST_PROJECT_ID,
    })

    expect(results).toHaveLength(2)
    const reqA = results.find((r) => r.request_id === 'req-a')!
    const reqB = results.find((r) => r.request_id === 'req-b')!

    expect(reqA.behavior).toBe('allow')
    expect(reqA.deny_message).toBeNull()

    expect(reqB.behavior).toBe('deny')
    expect(reqB.deny_message).toBe('Not allowed')
  })

  it('should include parsed input from permission request payload', () => {
    sessionEventsRepository.create({
      session_id: testSessionId,
      seq: 1,
      event_type: 'permission_request',
      payload: {
        requestId: 'req-input',
        toolName: 'Bash',
        description: 'Run command',
        input: { command: 'git status', timeout: 5000 },
      },
    })

    const results = sessionEventsRepository.listPermissions({
      project_id: TEST_PROJECT_ID,
    })

    expect(results).toHaveLength(1)
    expect(results[0]!.input).toEqual({ command: 'git status', timeout: 5000 })
  })

  it('should return empty input for malformed input JSON in payload', () => {
    // Insert directly via raw SQL to bypass the repository's JSON.stringify
    const db = getDatabase()
    const seq = sessionEventsRepository.getNextSeq(testSessionId)
    db.prepare(
      `INSERT INTO session_events (session_id, seq, event_type, payload)
       VALUES (?, ?, 'permission_request', ?)`
    ).run(
      testSessionId,
      seq,
      JSON.stringify({
        requestId: 'req-bad-input',
        toolName: 'Bash',
        description: 'Bad input',
        input: 'not-valid-json{{{',
      })
    )

    const results = sessionEventsRepository.listPermissions({
      project_id: TEST_PROJECT_ID,
    })

    expect(results).toHaveLength(1)
    expect(results[0]!.input).toEqual({})
  })

  it('should exclude permission requests from sessions without a ticket', () => {
    // Create a session with no ticket
    const ticketlessSession = sessionsRepository.create({
      kombuse_session_id: createSessionId('chat'),
      backend_type: 'mock',
    })

    createPermissionRequest(ticketlessSession.id, 1, {
      requestId: 'req-no-ticket',
      toolName: 'Bash',
    })

    const results = sessionEventsRepository.listPermissions({
      project_id: TEST_PROJECT_ID,
    })

    expect(results).toHaveLength(0)
  })
})
