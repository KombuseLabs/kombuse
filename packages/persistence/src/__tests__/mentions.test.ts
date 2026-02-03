/**
 * @fileoverview Tests for mentions repository operations
 *
 * Run all: bun run --filter @kombuse/persistence test -- src/__tests__/mentions.test.ts
 * Run one: bun run --filter @kombuse/persistence test -- -t "should create a mention"
 *
 * Tests cover:
 * - create: Insert new mentions
 * - createBatch: Insert multiple mentions at once
 * - get: Retrieve single mention by ID
 * - list: Query mentions with filters
 * - getByComment: Get all mentions in a comment
 * - getByProfile: Get all mentions of a profile
 * - delete: Remove mentions
 * - deleteByComment: Remove all mentions for a comment
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { setupTestDb, TEST_USER_ID, TEST_AGENT_ID, TEST_PROJECT_ID } from '../test-utils'
import { mentionsRepository } from '../mentions'

const NON_EXISTENT_ID = 999999

// We need to create a comment for mentions to reference
let testCommentId: number

describe('mentionsRepository', () => {
  let cleanup: () => void
  let db: DatabaseType

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    db = setup.db

    // Create a ticket and comment for mention references
    const ticketResult = db
      .prepare(
        'INSERT INTO tickets (project_id, author_id, title, status) VALUES (?, ?, ?, ?)'
      )
      .run(TEST_PROJECT_ID, TEST_USER_ID, 'Test Ticket', 'open')
    const ticketId = ticketResult.lastInsertRowid as number

    const commentResult = db
      .prepare('INSERT INTO comments (ticket_id, author_id, body) VALUES (?, ?, ?)')
      .run(ticketId, TEST_USER_ID, 'Test comment with @mentions')
    testCommentId = commentResult.lastInsertRowid as number
  })

  afterEach(() => {
    cleanup()
  })

  /*
   * CREATE TESTS
   */
  describe('create', () => {
    it('should create a mention', () => {
      const mention = mentionsRepository.create({
        comment_id: testCommentId,
        mentioned_id: TEST_AGENT_ID,
        mention_text: '@test-agent',
      })

      expect(mention.id).toBeDefined()
      expect(mention.comment_id).toBe(testCommentId)
      expect(mention.mentioned_id).toBe(TEST_AGENT_ID)
      expect(mention.mention_text).toBe('@test-agent')
    })

    it('should auto-generate timestamp on creation', () => {
      const mention = mentionsRepository.create({
        comment_id: testCommentId,
        mentioned_id: TEST_AGENT_ID,
        mention_text: '@test-agent',
      })

      expect(mention.created_at).toBeDefined()
      expect(() => new Date(mention.created_at)).not.toThrow()
    })
  })

  describe('createBatch', () => {
    it('should create multiple mentions at once', () => {
      const mentions = mentionsRepository.createBatch([
        { comment_id: testCommentId, mentioned_id: TEST_AGENT_ID, mention_text: '@agent' },
        { comment_id: testCommentId, mentioned_id: TEST_USER_ID, mention_text: '@user' },
      ])

      expect(mentions).toHaveLength(2)
      expect(mentions[0]?.mentioned_id).toBe(TEST_AGENT_ID)
      expect(mentions[1]?.mentioned_id).toBe(TEST_USER_ID)
    })

    it('should return empty array for empty input', () => {
      const mentions = mentionsRepository.createBatch([])

      expect(mentions).toHaveLength(0)
    })
  })

  /*
   * GET TESTS
   */
  describe('get', () => {
    it('should return null for non-existent mention ID', () => {
      const mention = mentionsRepository.get(NON_EXISTENT_ID)

      expect(mention).toBeNull()
    })

    it('should return mention by ID', () => {
      const created = mentionsRepository.create({
        comment_id: testCommentId,
        mentioned_id: TEST_AGENT_ID,
        mention_text: '@test-agent',
      })

      const mention = mentionsRepository.get(created.id)

      expect(mention).not.toBeNull()
      expect(mention?.id).toBe(created.id)
    })
  })

  describe('getByComment', () => {
    it('should return all mentions in a comment', () => {
      mentionsRepository.create({
        comment_id: testCommentId,
        mentioned_id: TEST_AGENT_ID,
        mention_text: '@agent',
      })
      mentionsRepository.create({
        comment_id: testCommentId,
        mentioned_id: TEST_USER_ID,
        mention_text: '@user',
      })

      const mentions = mentionsRepository.getByComment(testCommentId)

      expect(mentions).toHaveLength(2)
      expect(mentions.every((m) => m.comment_id === testCommentId)).toBe(true)
    })

    it('should return empty array for comment with no mentions', () => {
      const mentions = mentionsRepository.getByComment(testCommentId)

      expect(mentions).toHaveLength(0)
    })
  })

  describe('getByProfile', () => {
    it('should return all mentions of a profile', () => {
      // Create mentions in multiple comments
      mentionsRepository.create({
        comment_id: testCommentId,
        mentioned_id: TEST_AGENT_ID,
        mention_text: '@agent',
      })

      // Create another comment and mention the same profile
      const ticketResult = db
        .prepare(
          'INSERT INTO tickets (project_id, author_id, title, status) VALUES (?, ?, ?, ?)'
        )
        .run(TEST_PROJECT_ID, TEST_USER_ID, 'Another Ticket', 'open')
      const ticketId = ticketResult.lastInsertRowid as number

      const commentResult = db
        .prepare('INSERT INTO comments (ticket_id, author_id, body) VALUES (?, ?, ?)')
        .run(ticketId, TEST_USER_ID, 'Another comment')
      const anotherCommentId = commentResult.lastInsertRowid as number

      mentionsRepository.create({
        comment_id: anotherCommentId,
        mentioned_id: TEST_AGENT_ID,
        mention_text: '@agent',
      })

      const mentions = mentionsRepository.getByProfile(TEST_AGENT_ID)

      expect(mentions).toHaveLength(2)
      expect(mentions.every((m) => m.mentioned_id === TEST_AGENT_ID)).toBe(true)
    })

    it('should return empty array for profile with no mentions', () => {
      const mentions = mentionsRepository.getByProfile('never-mentioned-profile')

      expect(mentions).toHaveLength(0)
    })
  })

  /*
   * LIST TESTS
   */
  describe('list', () => {
    beforeEach(() => {
      mentionsRepository.create({
        comment_id: testCommentId,
        mentioned_id: TEST_AGENT_ID,
        mention_text: '@agent',
      })
      mentionsRepository.create({
        comment_id: testCommentId,
        mentioned_id: TEST_USER_ID,
        mention_text: '@user',
      })
    })

    it('should return all mentions when no filters provided', () => {
      const mentions = mentionsRepository.list()

      expect(mentions).toHaveLength(2)
    })

    it('should filter mentions by comment_id', () => {
      const mentions = mentionsRepository.list({ comment_id: testCommentId })

      expect(mentions).toHaveLength(2)
      expect(mentions.every((m) => m.comment_id === testCommentId)).toBe(true)
    })

    it('should filter mentions by mentioned_id', () => {
      const mentions = mentionsRepository.list({ mentioned_id: TEST_AGENT_ID })

      expect(mentions).toHaveLength(1)
      expect(mentions[0]?.mentioned_id).toBe(TEST_AGENT_ID)
    })

    it('should combine filters', () => {
      const mentions = mentionsRepository.list({
        comment_id: testCommentId,
        mentioned_id: TEST_AGENT_ID,
      })

      expect(mentions).toHaveLength(1)
      expect(mentions[0]?.comment_id).toBe(testCommentId)
      expect(mentions[0]?.mentioned_id).toBe(TEST_AGENT_ID)
    })
  })

  /*
   * DELETE TESTS
   */
  describe('delete', () => {
    it('should delete existing mention and return true', () => {
      const mention = mentionsRepository.create({
        comment_id: testCommentId,
        mentioned_id: TEST_AGENT_ID,
        mention_text: '@agent',
      })

      const deleted = mentionsRepository.delete(mention.id)

      expect(deleted).toBe(true)
      expect(mentionsRepository.get(mention.id)).toBeNull()
    })

    it('should return false when deleting non-existent mention', () => {
      const deleted = mentionsRepository.delete(NON_EXISTENT_ID)

      expect(deleted).toBe(false)
    })
  })

  describe('deleteByComment', () => {
    it('should delete all mentions for a comment', () => {
      mentionsRepository.create({
        comment_id: testCommentId,
        mentioned_id: TEST_AGENT_ID,
        mention_text: '@agent',
      })
      mentionsRepository.create({
        comment_id: testCommentId,
        mentioned_id: TEST_USER_ID,
        mention_text: '@user',
      })

      const deletedCount = mentionsRepository.deleteByComment(testCommentId)

      expect(deletedCount).toBe(2)
      expect(mentionsRepository.getByComment(testCommentId)).toHaveLength(0)
    })

    it('should return 0 when no mentions to delete', () => {
      const deletedCount = mentionsRepository.deleteByComment(NON_EXISTENT_ID)

      expect(deletedCount).toBe(0)
    })
  })
})
