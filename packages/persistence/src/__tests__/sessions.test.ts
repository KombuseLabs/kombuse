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
import { setupTestDb, TEST_USER_ID, TEST_PROJECT_ID } from '../test-utils'
import { sessionsRepository } from '../sessions'
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
