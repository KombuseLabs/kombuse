/**
 * @fileoverview Tests for sessions repository CRUD operations
 *
 * Run all: bun run --filter @kombuse/persistence test -- src/__tests__/sessions.test.ts
 * Run one: bun run --filter @kombuse/persistence test -- -t "should create session with ticket_id"
 *
 * Tests cover:
 * - create: Insert new sessions with ticket_id
 * - listByTicket: Query sessions by ticket ID
 * - list: Query sessions with ticket_id filter
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { createSessionId } from '@kombuse/types'
import { setupTestDb, TEST_USER_ID, TEST_AGENT_ID, TEST_PROJECT_ID } from '../test-utils'
import { sessionsRepository } from '../sessions'
import { sessionEventsRepository } from '../session-events'
import { ticketsRepository } from '../tickets'

describe('sessionsRepository', () => {
  let cleanup: () => void
  let db: DatabaseType
  let testTicketId: number

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    db = setup.db

    // Create a test ticket for session tests
    const ticket = ticketsRepository.create({
      title: 'Test ticket for sessions',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    testTicketId = ticket.id
  })

  afterEach(() => {
    cleanup()
  })

  /*
   * CREATE TESTS
   * Verify session creation with ticket_id
   */
  describe('create', () => {
    it('should create session without ticket_id', () => {
      const session = sessionsRepository.create()

      expect(session.id).toBeDefined()
      expect(session.ticket_id).toBeNull()
      expect(session.status).toBe('running')
    })

    it('should create session with ticket_id', () => {
      const session = sessionsRepository.create({
        ticket_id: testTicketId,
      })

      expect(session.id).toBeDefined()
      expect(session.ticket_id).toBe(testTicketId)
      expect(session.status).toBe('running')
    })

    it('should create session with agent_id', () => {
      db.prepare(`
        INSERT OR IGNORE INTO agents (id, system_prompt)
        VALUES (?, 'test prompt')
      `).run(TEST_AGENT_ID)

      const session = sessionsRepository.create({
        agent_id: TEST_AGENT_ID,
      })

      expect(session.agent_id).toBe(TEST_AGENT_ID)
      expect(session.status).toBe('running')
    })

    it('should create session with agent_id and ticket_id', () => {
      db.prepare(`
        INSERT OR IGNORE INTO agents (id, system_prompt)
        VALUES (?, 'test prompt')
      `).run(TEST_AGENT_ID)

      const session = sessionsRepository.create({
        agent_id: TEST_AGENT_ID,
        ticket_id: testTicketId,
      })

      expect(session.agent_id).toBe(TEST_AGENT_ID)
      expect(session.ticket_id).toBe(testTicketId)
    })

    it('should create session with kombuse_session_id and ticket_id', () => {
      const kombuseSessionId = createSessionId('trigger')
      const session = sessionsRepository.create({
        kombuse_session_id: kombuseSessionId,
        backend_type: 'claude-code',
        ticket_id: testTicketId,
      })

      expect(session.kombuse_session_id).toBe(kombuseSessionId)
      expect(session.backend_type).toBe('claude-code')
      expect(session.ticket_id).toBe(testTicketId)
    })
  })

  /*
   * LIST BY TICKET TESTS
   * Verify querying sessions by ticket ID
   */
  describe('listByTicket', () => {
    it('should return empty array when no sessions for ticket', () => {
      const sessions = sessionsRepository.listByTicket(testTicketId)

      expect(sessions).toHaveLength(0)
    })

    it('should return all sessions for a ticket', () => {
      sessionsRepository.create({ ticket_id: testTicketId })
      sessionsRepository.create({ ticket_id: testTicketId })
      sessionsRepository.create({ ticket_id: testTicketId })

      const sessions = sessionsRepository.listByTicket(testTicketId)

      expect(sessions).toHaveLength(3)
      expect(sessions.every((s) => s.ticket_id === testTicketId)).toBe(true)
    })

    it('should filter by status when listing by ticket', () => {
      const runningSession = sessionsRepository.create({ ticket_id: testTicketId })
      const completedSession = sessionsRepository.create({ ticket_id: testTicketId })
      sessionsRepository.update(completedSession.id, { status: 'completed' })

      const runningSessions = sessionsRepository.listByTicket(testTicketId, {
        status: 'running',
      })

      expect(runningSessions).toHaveLength(1)
      expect(runningSessions[0]?.id).toBe(runningSession.id)
    })

    it('should not return sessions from other tickets', () => {
      // Create another ticket
      const otherTicket = ticketsRepository.create({
        title: 'Other ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })

      sessionsRepository.create({ ticket_id: testTicketId })
      sessionsRepository.create({ ticket_id: otherTicket.id })

      const sessions = sessionsRepository.listByTicket(testTicketId)

      expect(sessions).toHaveLength(1)
      expect(sessions[0]?.ticket_id).toBe(testTicketId)
    })

    it('should order sessions by created_at DESC when sort_by is created_at', () => {
      sessionsRepository.create({ ticket_id: testTicketId })
      sessionsRepository.create({ ticket_id: testTicketId })
      sessionsRepository.create({ ticket_id: testTicketId })

      const sessions = sessionsRepository.listByTicket(testTicketId, { sort_by: 'created_at' })

      expect(sessions.length).toBe(3)
      for (let i = 1; i < sessions.length; i++) {
        const prevTime = new Date(sessions[i - 1]!.created_at).getTime()
        const currTime = new Date(sessions[i]!.created_at).getTime()
        expect(prevTime).toBeGreaterThanOrEqual(currTime)
      }
    })
  })

  /*
   * LIST WITH TICKET_ID FILTER TESTS
   * Verify filtering sessions by ticket_id in list()
   */
  describe('list with ticket_id filter', () => {
    it('should filter sessions by ticket_id', () => {
      sessionsRepository.create({ ticket_id: testTicketId })
      sessionsRepository.create() // No ticket

      const sessions = sessionsRepository.list({ ticket_id: testTicketId })

      expect(sessions).toHaveLength(1)
      expect(sessions[0]?.ticket_id).toBe(testTicketId)
    })

    it('should combine ticket_id and status filters', () => {
      const runningSession = sessionsRepository.create({ ticket_id: testTicketId })
      const completedSession = sessionsRepository.create({ ticket_id: testTicketId })
      sessionsRepository.update(completedSession.id, { status: 'completed' })

      const sessions = sessionsRepository.list({
        ticket_id: testTicketId,
        status: 'running',
      })

      expect(sessions).toHaveLength(1)
      expect(sessions[0]?.id).toBe(runningSession.id)
    })

    it('should return all sessions when no ticket_id filter', () => {
      sessionsRepository.create({ ticket_id: testTicketId })
      sessionsRepository.create()

      const sessions = sessionsRepository.list()

      expect(sessions).toHaveLength(2)
    })
  })

  /*
   * SORT_BY TESTS
   * Verify sort_by parameter controls ordering
   */
  describe('sort_by', () => {
    it('should default to updated_at DESC for list()', () => {
      const s1 = sessionsRepository.create({ ticket_id: testTicketId })
      const s2 = sessionsRepository.create({ ticket_id: testTicketId })

      // Touch s1 so its updated_at is newer than s2
      sessionsRepository.touch(s1.id)

      const sessions = sessionsRepository.list()

      expect(sessions[0]!.id, 'most recently touched session should be first').toBe(s1.id)
      expect(sessions[1]!.id).toBe(s2.id)
    })

    it('should sort by created_at when explicitly requested', () => {
      const s1 = sessionsRepository.create({ ticket_id: testTicketId })
      const s2 = sessionsRepository.create({ ticket_id: testTicketId })

      // Set distinct created_at values so ordering is deterministic
      db.prepare("UPDATE sessions SET created_at = '2025-01-01 00:00:00' WHERE id = ?").run(s1.id)
      db.prepare("UPDATE sessions SET created_at = '2025-01-02 00:00:00' WHERE id = ?").run(s2.id)

      // Touch s1 so its updated_at is newer than s2
      sessionsRepository.touch(s1.id)

      const sessions = sessionsRepository.list({ sort_by: 'created_at' })

      expect(sessions[0]!.id, 'most recently created session should be first').toBe(s2.id)
      expect(sessions[1]!.id).toBe(s1.id)
    })

    it('should default to updated_at DESC for listByTicket()', () => {
      const s1 = sessionsRepository.create({ ticket_id: testTicketId })
      const s2 = sessionsRepository.create({ ticket_id: testTicketId })

      // Touch s1 so its updated_at is newer than s2
      sessionsRepository.touch(s1.id)

      const sessions = sessionsRepository.listByTicket(testTicketId)

      expect(sessions[0]!.id, 'most recently touched session should be first').toBe(s1.id)
      expect(sessions[1]!.id).toBe(s2.id)
    })
  })

  /*
   * METADATA TESTS
   * Verify agent_name and prompt_preview in list() and listByTicket()
   */
  describe('list metadata (agent_name, prompt_preview)', () => {
    function seedAgentInvocation(kombuseSessionId: string) {
      // Ensure agent record exists for TEST_AGENT_ID
      db.prepare(`
        INSERT OR IGNORE INTO agents (id, system_prompt)
        VALUES (?, 'test prompt')
      `).run(TEST_AGENT_ID)

      // Create a trigger for the agent
      const trigger = db.prepare(`
        INSERT INTO agent_triggers (agent_id, event_type)
        VALUES (?, 'ticket.created')
      `).run(TEST_AGENT_ID)

      // Create an invocation linking to the session via kombuse_session_id
      db.prepare(`
        INSERT INTO agent_invocations (agent_id, trigger_id, context, kombuse_session_id)
        VALUES (?, ?, '{}', ?)
      `).run(TEST_AGENT_ID, trigger.lastInsertRowid, kombuseSessionId)
    }

    it('should return agent_name when session is linked to an agent', () => {
      const kombuseSessionId = createSessionId('trigger')
      sessionsRepository.create({ kombuse_session_id: kombuseSessionId })
      seedAgentInvocation(kombuseSessionId)

      const sessions = sessionsRepository.list()

      expect(sessions).toHaveLength(1)
      expect(sessions[0]!.agent_name).toBe('Test Agent')
    })

    it('should return prompt_preview from first message event', () => {
      const kombuseSessionId = createSessionId('chat')
      const session = sessionsRepository.create({ kombuse_session_id: kombuseSessionId })

      sessionEventsRepository.create({
        session_id: session.id,
        seq: 1,
        event_type: 'message',
        payload: { content: 'Help me fix the login bug in auth.ts' },
      })

      const sessions = sessionsRepository.list()

      expect(sessions).toHaveLength(1)
      expect(sessions[0]!.prompt_preview).toBe('Help me fix the login bug in auth.ts')
    })

    it('should return null for both fields when no agent or events exist', () => {
      sessionsRepository.create()

      const sessions = sessionsRepository.list()

      expect(sessions).toHaveLength(1)
      expect(sessions[0]!.agent_name).toBeNull()
      expect(sessions[0]!.prompt_preview).toBeNull()
    })

    it('should prefer agent_name over prompt_preview when both exist', () => {
      const kombuseSessionId = createSessionId('trigger')
      const session = sessionsRepository.create({ kombuse_session_id: kombuseSessionId })
      seedAgentInvocation(kombuseSessionId)

      sessionEventsRepository.create({
        session_id: session.id,
        seq: 1,
        event_type: 'message',
        payload: { content: 'You are helping with ticket #1' },
      })

      const sessions = sessionsRepository.list()

      expect(sessions).toHaveLength(1)
      expect(sessions[0]!.agent_name).toBe('Test Agent')
      expect(sessions[0]!.prompt_preview).toBe('You are helping with ticket #1')
    })

    it('should truncate prompt_preview to 80 characters', () => {
      const longContent = 'A'.repeat(200)
      const session = sessionsRepository.create()

      sessionEventsRepository.create({
        session_id: session.id,
        seq: 1,
        event_type: 'message',
        payload: { content: longContent },
      })

      const sessions = sessionsRepository.list()

      expect(sessions[0]!.prompt_preview).toHaveLength(80)
    })

    it('should return one row per session even with multiple agent_invocations', () => {
      const kombuseSessionId = createSessionId('trigger')
      sessionsRepository.create({ kombuse_session_id: kombuseSessionId, ticket_id: testTicketId })

      // Ensure agent record exists
      db.prepare(`
        INSERT OR IGNORE INTO agents (id, system_prompt)
        VALUES (?, 'test prompt')
      `).run(TEST_AGENT_ID)

      // Create a second agent profile for the second invocation
      const secondAgentId = 'test-agent-2'
      db.prepare(`
        INSERT OR IGNORE INTO profiles (id, type, name)
        VALUES (?, 'agent', 'Second Agent')
      `).run(secondAgentId)
      db.prepare(`
        INSERT OR IGNORE INTO agents (id, system_prompt)
        VALUES (?, 'test prompt 2')
      `).run(secondAgentId)

      // Create two triggers and two invocations for the same session
      const trigger1 = db.prepare(`
        INSERT INTO agent_triggers (agent_id, event_type)
        VALUES (?, 'ticket.created')
      `).run(TEST_AGENT_ID)
      db.prepare(`
        INSERT INTO agent_invocations (agent_id, trigger_id, context, kombuse_session_id, created_at)
        VALUES (?, ?, '{}', ?, '2025-01-01 00:00:00')
      `).run(TEST_AGENT_ID, trigger1.lastInsertRowid, kombuseSessionId)

      const trigger2 = db.prepare(`
        INSERT INTO agent_triggers (agent_id, event_type)
        VALUES (?, 'ticket.created')
      `).run(secondAgentId)
      db.prepare(`
        INSERT INTO agent_invocations (agent_id, trigger_id, context, kombuse_session_id, created_at)
        VALUES (?, ?, '{}', ?, '2025-01-02 00:00:00')
      `).run(secondAgentId, trigger2.lastInsertRowid, kombuseSessionId)

      // list() should return exactly 1 row, not 2
      const sessions = sessionsRepository.list()
      expect(sessions, 'should not duplicate sessions with multiple invocations').toHaveLength(1)
      expect(sessions[0]!.agent_name, 'should pick most recent invocation agent name').toBe('Second Agent')

      // listByTicket() should also return exactly 1 row
      const ticketSessions = sessionsRepository.listByTicket(testTicketId)
      expect(ticketSessions, 'listByTicket should not duplicate sessions').toHaveLength(1)
      expect(ticketSessions[0]!.agent_name).toBe('Second Agent')
    })

    it('should return agent_name from sessions.agent_id (direct link)', () => {
      db.prepare(`
        INSERT OR IGNORE INTO agents (id, system_prompt)
        VALUES (?, 'test prompt')
      `).run(TEST_AGENT_ID)

      sessionsRepository.create({ agent_id: TEST_AGENT_ID })

      const sessions = sessionsRepository.list()

      expect(sessions).toHaveLength(1)
      expect(sessions[0]!.agent_name).toBe('Test Agent')
    })

    it('should prefer sessions.agent_id over agent_invocations for agent_name', () => {
      db.prepare(`
        INSERT OR IGNORE INTO agents (id, system_prompt)
        VALUES (?, 'test prompt')
      `).run(TEST_AGENT_ID)

      const secondAgentId = 'test-agent-2'
      db.prepare(`
        INSERT OR IGNORE INTO profiles (id, type, name)
        VALUES (?, 'agent', 'Second Agent')
      `).run(secondAgentId)
      db.prepare(`
        INSERT OR IGNORE INTO agents (id, system_prompt)
        VALUES (?, 'test prompt 2')
      `).run(secondAgentId)

      const kombuseSessionId = createSessionId('chat')
      sessionsRepository.create({
        kombuse_session_id: kombuseSessionId,
        agent_id: TEST_AGENT_ID,
      })

      // Seed invocation pointing to second agent (legacy path)
      const trigger = db.prepare(`
        INSERT INTO agent_triggers (agent_id, event_type)
        VALUES (?, 'ticket.created')
      `).run(secondAgentId)
      db.prepare(`
        INSERT INTO agent_invocations (agent_id, trigger_id, context, kombuse_session_id)
        VALUES (?, ?, '{}', ?)
      `).run(secondAgentId, trigger.lastInsertRowid, kombuseSessionId)

      const sessions = sessionsRepository.list()

      expect(sessions).toHaveLength(1)
      expect(sessions[0]!.agent_name, 'direct link should win over invocation lookup').toBe('Test Agent')
    })

    it('should return metadata in listByTicket()', () => {
      const kombuseSessionId = createSessionId('trigger')
      sessionsRepository.create({
        kombuse_session_id: kombuseSessionId,
        ticket_id: testTicketId,
      })
      seedAgentInvocation(kombuseSessionId)

      const sessions = sessionsRepository.listByTicket(testTicketId)

      expect(sessions).toHaveLength(1)
      expect(sessions[0]!.agent_name).toBe('Test Agent')
    })
  })

  /*
   * ABORT ALL RUNNING SESSIONS TESTS
   * Verify bulk cleanup of orphaned running sessions
   */
  describe('abortAllRunningSessions', () => {
    it('should abort all running sessions', () => {
      sessionsRepository.create({ ticket_id: testTicketId })
      sessionsRepository.create({ ticket_id: testTicketId })
      sessionsRepository.create() // no ticket

      const abortedCount = sessionsRepository.abortAllRunningSessions()

      expect(abortedCount).toBe(3)

      const running = sessionsRepository.list({ status: 'running' })
      expect(running).toHaveLength(0)

      const aborted = sessionsRepository.list({ status: 'aborted' })
      expect(aborted).toHaveLength(3)
    })

    it('should not affect completed or failed sessions', () => {
      const s1 = sessionsRepository.create({ ticket_id: testTicketId })
      const s2 = sessionsRepository.create({ ticket_id: testTicketId })
      sessionsRepository.update(s1.id, { status: 'completed' })
      sessionsRepository.update(s2.id, { status: 'failed' })

      const abortedCount = sessionsRepository.abortAllRunningSessions()

      expect(abortedCount).toBe(0)

      const completed = sessionsRepository.list({ status: 'completed' })
      expect(completed).toHaveLength(1)

      const failed = sessionsRepository.list({ status: 'failed' })
      expect(failed).toHaveLength(1)
    })

    it('should return 0 when no running sessions exist', () => {
      const abortedCount = sessionsRepository.abortAllRunningSessions()
      expect(abortedCount).toBe(0)
    })
  })
})
