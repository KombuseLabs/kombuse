import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  setupTestDb,
  TEST_USER_ID,
  TEST_PROJECT_ID,
} from '@kombuse/persistence/test-utils'
import { ticketsRepository, sessionsRepository } from '@kombuse/persistence'
import type { AgentEvent, KombuseSessionId } from '@kombuse/types'
import { SessionPersistenceService } from '../session-persistence-service'

describe('SessionPersistenceService', () => {
  let cleanup: () => void
  let service: SessionPersistenceService
  let testTicketId: number

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    service = new SessionPersistenceService()

    const ticket = ticketsRepository.create({
      title: 'Test Ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    testTicketId = ticket.id
  })

  afterEach(() => {
    cleanup()
  })

  describe('cli_version extraction from init events', () => {
    it('should extract cli_version from a raw init event with claude_code_version', () => {
      const sessionId = service.ensureSession(
        'chat-version-test' as KombuseSessionId,
        'claude-code',
        testTicketId,
      )

      const initEvent: AgentEvent = {
        type: 'raw',
        eventId: 'evt-1',
        backend: 'claude-code',
        timestamp: Date.now(),
        sourceType: 'init',
        data: {
          type: 'system',
          subtype: 'init',
          claude_code_version: '1.0.42',
          model: 'claude-sonnet-4-20250514',
          permissionMode: 'default',
        },
      }

      service.persistEvent(sessionId, initEvent)

      const metadata = service.getMetadata(sessionId)
      expect(metadata.cli_version).toBe('1.0.42')
    })

    it('should not set cli_version when claude_code_version is absent', () => {
      const sessionId = service.ensureSession(
        'chat-no-version' as KombuseSessionId,
        'claude-code',
        testTicketId,
      )

      const initEvent: AgentEvent = {
        type: 'raw',
        eventId: 'evt-2',
        backend: 'claude-code',
        timestamp: Date.now(),
        sourceType: 'init',
        data: {
          type: 'system',
          subtype: 'init',
          model: 'claude-sonnet-4-20250514',
        },
      }

      service.persistEvent(sessionId, initEvent)

      const metadata = service.getMetadata(sessionId)
      expect(metadata.cli_version).toBeUndefined()
    })

    it('should only extract cli_version once per session', () => {
      const sessionId = service.ensureSession(
        'chat-once-test' as KombuseSessionId,
        'claude-code',
        testTicketId,
      )

      const makeInitEvent = (version: string): AgentEvent => ({
        type: 'raw',
        eventId: `evt-${version}`,
        backend: 'claude-code',
        timestamp: Date.now(),
        sourceType: 'init',
        data: {
          type: 'system',
          subtype: 'init',
          claude_code_version: version,
        },
      })

      service.persistEvent(sessionId, makeInitEvent('1.0.1'))
      service.persistEvent(sessionId, makeInitEvent('1.0.2'))

      const metadata = service.getMetadata(sessionId)
      expect(metadata.cli_version).toBe('1.0.1')
    })

    it('should not extract cli_version from non-init raw events', () => {
      const sessionId = service.ensureSession(
        'chat-non-init' as KombuseSessionId,
        'claude-code',
        testTicketId,
      )

      const rawEvent: AgentEvent = {
        type: 'raw',
        eventId: 'evt-3',
        backend: 'claude-code',
        timestamp: Date.now(),
        sourceType: 'cli_pre_normalization',
        data: {
          claude_code_version: '1.0.42',
        },
      }

      service.persistEvent(sessionId, rawEvent)

      const metadata = service.getMetadata(sessionId)
      expect(metadata.cli_version).toBeUndefined()
    })
  })

  describe('markSessionRunning clears terminal timestamps', () => {
    it('should clear completed_at when resuming a completed session', () => {
      const sessionId = service.ensureSession(
        'chat-completed-resume' as KombuseSessionId,
        'claude-code',
        testTicketId,
      )

      service.completeSession(sessionId)

      let session = sessionsRepository.get(sessionId)
      expect(session?.status).toBe('completed')
      expect(session?.completed_at).not.toBeNull()

      service.markSessionRunning(sessionId)

      session = sessionsRepository.get(sessionId)
      expect(session?.status).toBe('running')
      expect(session?.completed_at, 'completed_at should be cleared').toBeNull()
      expect(session?.failed_at, 'failed_at should be cleared').toBeNull()
      expect(session?.aborted_at, 'aborted_at should be cleared').toBeNull()
    })

    it('should clear failed_at when resuming a failed session', () => {
      const sessionId = service.ensureSession(
        'chat-failed-resume' as KombuseSessionId,
        'claude-code',
        testTicketId,
      )

      service.failSession(sessionId)

      let session = sessionsRepository.get(sessionId)
      expect(session?.status).toBe('failed')
      expect(session?.failed_at).not.toBeNull()

      service.markSessionRunning(sessionId)

      session = sessionsRepository.get(sessionId)
      expect(session?.status).toBe('running')
      expect(session?.failed_at, 'failed_at should be cleared').toBeNull()
    })

    it('should clear aborted_at and failed_at when resuming an aborted session', () => {
      const sessionId = service.ensureSession(
        'chat-aborted-resume' as KombuseSessionId,
        'claude-code',
        testTicketId,
      )

      service.abortSession(sessionId)

      let session = sessionsRepository.get(sessionId)
      expect(session?.status).toBe('aborted')
      expect(session?.aborted_at).not.toBeNull()

      service.markSessionRunning(sessionId)

      session = sessionsRepository.get(sessionId)
      expect(session?.status).toBe('running')
      expect(session?.aborted_at, 'aborted_at should be cleared').toBeNull()
      expect(session?.failed_at, 'failed_at should be cleared').toBeNull()
      expect(session?.completed_at, 'completed_at should be cleared').toBeNull()
    })
  })
})
