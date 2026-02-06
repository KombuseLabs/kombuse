/**
 * @fileoverview Tests for attachments repository CRUD operations
 *
 * Run all: bun run --filter @kombuse/persistence test -- src/__tests__/attachments.test.ts
 * Run one: bun run --filter @kombuse/persistence test -- -t "should create"
 *
 * Tests cover:
 * - create: Insert attachment records for tickets and comments
 * - get: Retrieve single attachment by ID
 * - getByTicket / getByComment: Domain-specific queries
 * - list: Query with filters
 * - delete: Remove attachment records
 * - cascade: Verify cascade deletes from parent ticket/comment
 * - XOR constraint: Exactly one of comment_id/ticket_id required
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { setupTestDb, TEST_USER_ID, TEST_PROJECT_ID } from '../test-utils'
import { attachmentsRepository } from '../attachments'
import { ticketsRepository } from '../tickets'
import { commentsRepository } from '../comments'

const NON_EXISTENT_ID = 999999

describe('attachmentsRepository', () => {
  let cleanup: () => void
  let db: DatabaseType
  let testTicketId: number
  let testCommentId: number

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    db = setup.db

    // Create a ticket and comment for attachment tests
    const ticket = ticketsRepository.create({
      title: 'Test ticket for attachments',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    testTicketId = ticket.id

    const comment = commentsRepository.create({
      ticket_id: testTicketId,
      author_id: TEST_USER_ID,
      body: 'Test comment for attachments',
    })
    testCommentId = comment.id
  })

  afterEach(() => {
    cleanup()
  })

  /*
   * CREATE TESTS
   */
  describe('create', () => {
    it('should create a ticket attachment with all required fields', () => {
      const attachment = attachmentsRepository.create({
        ticket_id: testTicketId,
        filename: 'screenshot.png',
        mime_type: 'image/png',
        size_bytes: 1024,
        storage_path: '2026/02/abc-screenshot.png',
        uploaded_by_id: TEST_USER_ID,
      })

      expect(attachment.id).toBeDefined()
      expect(attachment.ticket_id).toBe(testTicketId)
      expect(attachment.comment_id).toBeNull()
      expect(attachment.filename).toBe('screenshot.png')
      expect(attachment.mime_type).toBe('image/png')
      expect(attachment.size_bytes).toBe(1024)
      expect(attachment.storage_path).toBe('2026/02/abc-screenshot.png')
      expect(attachment.uploaded_by_id).toBe(TEST_USER_ID)
    })

    it('should create a comment attachment with all required fields', () => {
      const attachment = attachmentsRepository.create({
        comment_id: testCommentId,
        filename: 'diagram.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 2048,
        storage_path: '2026/02/def-diagram.jpg',
        uploaded_by_id: TEST_USER_ID,
      })

      expect(attachment.id).toBeDefined()
      expect(attachment.comment_id).toBe(testCommentId)
      expect(attachment.ticket_id).toBeNull()
      expect(attachment.filename).toBe('diagram.jpg')
      expect(attachment.mime_type).toBe('image/jpeg')
    })

    it('should auto-generate created_at timestamp', () => {
      const attachment = attachmentsRepository.create({
        ticket_id: testTicketId,
        filename: 'test.png',
        mime_type: 'image/png',
        size_bytes: 100,
        storage_path: '2026/02/test.png',
        uploaded_by_id: TEST_USER_ID,
      })

      expect(attachment.created_at).toBeDefined()
      expect(() => new Date(attachment.created_at)).not.toThrow()
    })

    it('should reject when neither comment_id nor ticket_id is provided', () => {
      expect(() =>
        attachmentsRepository.create({
          filename: 'orphan.png',
          mime_type: 'image/png',
          size_bytes: 100,
          storage_path: '2026/02/orphan.png',
          uploaded_by_id: TEST_USER_ID,
        })
      ).toThrow()
    })

    it('should reject when both comment_id and ticket_id are provided', () => {
      expect(() =>
        attachmentsRepository.create({
          comment_id: testCommentId,
          ticket_id: testTicketId,
          filename: 'both.png',
          mime_type: 'image/png',
          size_bytes: 100,
          storage_path: '2026/02/both.png',
          uploaded_by_id: TEST_USER_ID,
        })
      ).toThrow()
    })
  })

  /*
   * GET TESTS
   */
  describe('get', () => {
    it('should return null for non-existent attachment ID', () => {
      const attachment = attachmentsRepository.get(NON_EXISTENT_ID)

      expect(attachment).toBeNull()
    })

    it('should return attachment by ID', () => {
      const created = attachmentsRepository.create({
        ticket_id: testTicketId,
        filename: 'test.png',
        mime_type: 'image/png',
        size_bytes: 512,
        storage_path: '2026/02/test.png',
        uploaded_by_id: TEST_USER_ID,
      })

      const attachment = attachmentsRepository.get(created.id)

      expect(attachment).not.toBeNull()
      expect(attachment?.id).toBe(created.id)
      expect(attachment?.filename).toBe('test.png')
    })
  })

  /*
   * GET BY TICKET TESTS
   */
  describe('getByTicket', () => {
    it('should return all attachments for a ticket', () => {
      attachmentsRepository.create({
        ticket_id: testTicketId,
        filename: 'a.png',
        mime_type: 'image/png',
        size_bytes: 100,
        storage_path: '2026/02/a.png',
        uploaded_by_id: TEST_USER_ID,
      })
      attachmentsRepository.create({
        ticket_id: testTicketId,
        filename: 'b.png',
        mime_type: 'image/png',
        size_bytes: 200,
        storage_path: '2026/02/b.png',
        uploaded_by_id: TEST_USER_ID,
      })

      const attachments = attachmentsRepository.getByTicket(testTicketId)

      expect(attachments).toHaveLength(2)
    })

    it('should return empty array when ticket has no attachments', () => {
      const attachments = attachmentsRepository.getByTicket(testTicketId)

      expect(attachments).toHaveLength(0)
    })

    it('should not return comment attachments', () => {
      attachmentsRepository.create({
        comment_id: testCommentId,
        filename: 'comment-img.png',
        mime_type: 'image/png',
        size_bytes: 100,
        storage_path: '2026/02/comment-img.png',
        uploaded_by_id: TEST_USER_ID,
      })

      const attachments = attachmentsRepository.getByTicket(testTicketId)

      expect(attachments).toHaveLength(0)
    })
  })

  /*
   * GET BY COMMENT TESTS
   */
  describe('getByComment', () => {
    it('should return all attachments for a comment', () => {
      attachmentsRepository.create({
        comment_id: testCommentId,
        filename: 'c.png',
        mime_type: 'image/png',
        size_bytes: 100,
        storage_path: '2026/02/c.png',
        uploaded_by_id: TEST_USER_ID,
      })

      const attachments = attachmentsRepository.getByComment(testCommentId)

      expect(attachments).toHaveLength(1)
      expect(attachments[0]?.filename).toBe('c.png')
    })

    it('should return empty array when comment has no attachments', () => {
      const attachments = attachmentsRepository.getByComment(testCommentId)

      expect(attachments).toHaveLength(0)
    })

    it('should not return ticket attachments', () => {
      attachmentsRepository.create({
        ticket_id: testTicketId,
        filename: 'ticket-img.png',
        mime_type: 'image/png',
        size_bytes: 100,
        storage_path: '2026/02/ticket-img.png',
        uploaded_by_id: TEST_USER_ID,
      })

      const attachments = attachmentsRepository.getByComment(testCommentId)

      expect(attachments).toHaveLength(0)
    })
  })

  /*
   * LIST TESTS
   */
  describe('list', () => {
    beforeEach(() => {
      attachmentsRepository.create({
        ticket_id: testTicketId,
        filename: 'ticket-file.png',
        mime_type: 'image/png',
        size_bytes: 100,
        storage_path: '2026/02/ticket-file.png',
        uploaded_by_id: TEST_USER_ID,
      })
      attachmentsRepository.create({
        comment_id: testCommentId,
        filename: 'comment-file.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 200,
        storage_path: '2026/02/comment-file.jpg',
        uploaded_by_id: TEST_USER_ID,
      })
    })

    it('should return all attachments when no filters provided', () => {
      const attachments = attachmentsRepository.list()

      expect(attachments).toHaveLength(2)
    })

    it('should filter by ticket_id', () => {
      const attachments = attachmentsRepository.list({
        ticket_id: testTicketId,
      })

      expect(attachments).toHaveLength(1)
      expect(attachments[0]?.filename).toBe('ticket-file.png')
    })

    it('should filter by comment_id', () => {
      const attachments = attachmentsRepository.list({
        comment_id: testCommentId,
      })

      expect(attachments).toHaveLength(1)
      expect(attachments[0]?.filename).toBe('comment-file.jpg')
    })

    it('should filter by uploaded_by_id', () => {
      const attachments = attachmentsRepository.list({
        uploaded_by_id: TEST_USER_ID,
      })

      expect(attachments).toHaveLength(2)
    })

    it('should return empty array for non-matching filter', () => {
      const attachments = attachmentsRepository.list({
        uploaded_by_id: 'non-existent-user',
      })

      expect(attachments).toHaveLength(0)
    })
  })

  /*
   * DELETE TESTS
   */
  describe('delete', () => {
    it('should delete existing attachment and return true', () => {
      const attachment = attachmentsRepository.create({
        ticket_id: testTicketId,
        filename: 'to-delete.png',
        mime_type: 'image/png',
        size_bytes: 100,
        storage_path: '2026/02/to-delete.png',
        uploaded_by_id: TEST_USER_ID,
      })

      const deleted = attachmentsRepository.delete(attachment.id)

      expect(deleted).toBe(true)
      expect(attachmentsRepository.get(attachment.id)).toBeNull()
    })

    it('should return false for non-existent attachment', () => {
      const deleted = attachmentsRepository.delete(NON_EXISTENT_ID)

      expect(deleted).toBe(false)
    })
  })

  /*
   * CASCADE DELETE TESTS
   */
  describe('cascade deletes', () => {
    it('should delete attachments when parent ticket is deleted', () => {
      const attachment = attachmentsRepository.create({
        ticket_id: testTicketId,
        filename: 'cascade-test.png',
        mime_type: 'image/png',
        size_bytes: 100,
        storage_path: '2026/02/cascade-test.png',
        uploaded_by_id: TEST_USER_ID,
      })

      ticketsRepository.delete(testTicketId)

      expect(
        attachmentsRepository.get(attachment.id),
        'Attachment should be cascade-deleted with ticket'
      ).toBeNull()
    })

    it('should delete attachments when parent comment is deleted', () => {
      const attachment = attachmentsRepository.create({
        comment_id: testCommentId,
        filename: 'cascade-comment.png',
        mime_type: 'image/png',
        size_bytes: 100,
        storage_path: '2026/02/cascade-comment.png',
        uploaded_by_id: TEST_USER_ID,
      })

      commentsRepository.delete(testCommentId)

      expect(
        attachmentsRepository.get(attachment.id),
        'Attachment should be cascade-deleted with comment'
      ).toBeNull()
    })
  })
})
