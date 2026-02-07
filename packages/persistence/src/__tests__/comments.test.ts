/**
 * @fileoverview Tests for comments repository CRUD operations
 *
 * Run all: bun run --filter @kombuse/persistence test -- src/__tests__/comments.test.ts
 * Run one: bun run --filter @kombuse/persistence test -- -t "should create a comment"
 *
 * Tests cover:
 * - create: Insert new comments with automatic @mention parsing
 * - get: Retrieve single comment by ID
 * - getByTicket: Get all comments for a ticket
 * - list: Query comments with filters
 * - update: Modify existing comments (sets is_edited flag)
 * - delete: Remove comments
 * - @mention parsing and mention record creation
 * - Event logging for comments
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { setupTestDb, TEST_USER_ID, TEST_AGENT_ID, TEST_PROJECT_ID } from '../test-utils'
import { commentsRepository } from '../comments'
import { ticketsRepository } from '../tickets'
import { mentionsRepository } from '../mentions'
import { eventsRepository } from '../events'

const NON_EXISTENT_ID = 999999

describe('commentsRepository', () => {
  let cleanup: () => void
  let db: DatabaseType
  let testTicketId: number

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    db = setup.db

    // Create a test ticket for comments
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

  /*
   * CREATE TESTS
   */
  describe('create', () => {
    it('should create a comment with required fields', () => {
      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'This is a test comment',
      })

      expect(comment.id).toBeDefined()
      expect(comment.ticket_id).toBe(testTicketId)
      expect(comment.author_id).toBe(TEST_USER_ID)
      expect(comment.body).toBe('This is a test comment')
      expect(comment.is_edited).toBe(false)
      expect(comment.parent_id).toBeNull()
      expect(comment.author).toBeDefined()
      expect(comment.author.id).toBe(TEST_USER_ID)
      expect(comment.author.name).toBe('Test User')
      expect(comment.author.type).toBe('user')
    })

    it('should create a reply to another comment', () => {
      const parent = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Parent comment',
      })

      const reply = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_AGENT_ID,
        body: 'Reply to parent',
        parent_id: parent.id,
      })

      expect(reply.parent_id).toBe(parent.id)
      expect(reply.author.id).toBe(TEST_AGENT_ID)
      expect(reply.author.name).toBe('Test Agent')
      expect(reply.author.type).toBe('agent')
    })

    it('should auto-generate timestamps on creation', () => {
      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Test comment',
      })

      expect(comment.created_at).toBeDefined()
      expect(comment.updated_at).toBeDefined()
      expect(() => new Date(comment.created_at)).not.toThrow()
    })

    it('should create with external source fields', () => {
      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Imported comment',
        external_source: 'github',
        external_id: 'gh-comment-123',
      })

      expect(comment.external_source).toBe('github')
      expect(comment.external_id).toBe('gh-comment-123')
    })

    it('should create a comment with kombuse_session_id', () => {
      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_AGENT_ID,
        body: 'Agent comment linked to session',
        kombuse_session_id: 'trigger-abc-123',
      })

      expect(comment.kombuse_session_id).toBe('trigger-abc-123')
    })

    it('should default kombuse_session_id to null when not provided', () => {
      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'User comment without session',
      })

      expect(comment.kombuse_session_id).toBeNull()
    })

    it('should return kombuse_session_id in get() and getByTicket()', () => {
      const created = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_AGENT_ID,
        body: 'Linked comment',
        kombuse_session_id: 'trigger-xyz-456',
      })

      const fetched = commentsRepository.get(created.id)
      expect(fetched?.kombuse_session_id).toBe('trigger-xyz-456')

      const byTicket = commentsRepository.getByTicket(testTicketId)
      expect(byTicket[0]?.kombuse_session_id).toBe('trigger-xyz-456')
    })
  })

  /*
   * @MENTION PARSING TESTS
   */
  describe('create with @mentions', () => {
    it('should parse @mentions and create mention records', () => {
      // The seeded test user has name from test-utils
      // Create a profile that can be mentioned
      db.prepare(
        'INSERT INTO profiles (id, type, name, is_active) VALUES (?, ?, ?, 1)'
      ).run('mentionable-user', 'user', 'mentionable')

      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Hey @mentionable can you look at this?',
      })

      const mentions = mentionsRepository.getByComment(comment.id)

      expect(mentions).toHaveLength(1)
      expect(mentions[0]?.mention_type).toBe('profile')
      expect(mentions[0]?.mentioned_profile_id).toBe('mentionable-user')
      expect(mentions[0]?.mention_text).toBe('@mentionable')
    })

    it('should handle multiple @mentions', () => {
      // Create mentionable profiles
      db.prepare(
        'INSERT INTO profiles (id, type, name, is_active) VALUES (?, ?, ?, 1)'
      ).run('user-alice', 'user', 'alice')
      db.prepare(
        'INSERT INTO profiles (id, type, name, is_active) VALUES (?, ?, ?, 1)'
      ).run('user-bob', 'user', 'bob')

      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: '@alice and @bob please review this',
      })

      const mentions = mentionsRepository.getByComment(comment.id)

      expect(mentions).toHaveLength(2)
      expect(mentions.map((m) => m.mentioned_profile_id).sort()).toEqual([
        'user-alice',
        'user-bob',
      ])
    })

    it('should not create duplicate mentions for same profile', () => {
      db.prepare(
        'INSERT INTO profiles (id, type, name, is_active) VALUES (?, ?, ?, 1)'
      ).run('user-claude', 'user', 'claude')

      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: '@claude please look at this. What do you think @claude?',
      })

      const mentions = mentionsRepository.getByComment(comment.id)

      expect(mentions, 'Should deduplicate mentions').toHaveLength(1)
    })

    it('should parse #ticket mentions and create mention records', () => {
      const targetTicket = ticketsRepository.create({
        title: 'Mention target',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })

      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: `Related to #${targetTicket.id}`,
      })

      const mentions = mentionsRepository.getByComment(comment.id)

      expect(mentions).toHaveLength(1)
      expect(mentions[0]?.mention_type).toBe('ticket')
      expect(mentions[0]?.mentioned_ticket_id).toBe(targetTicket.id)
    })

    it('should ignore #ticket mentions when the target ticket does not exist', () => {
      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Related to #999999',
      })

      const mentions = mentionsRepository.getByComment(comment.id)
      expect(mentions).toHaveLength(0)
    })

    it('should ignore @mentions that do not match a profile', () => {
      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Hey @nonexistent-user check this out',
      })

      const mentions = mentionsRepository.getByComment(comment.id)

      expect(mentions, 'No mention record for non-existent profile').toHaveLength(0)
    })

    it('should create mention.created events for each mention', () => {
      db.prepare(
        'INSERT INTO profiles (id, type, name, is_active) VALUES (?, ?, ?, 1)'
      ).run('agent-helper', 'agent', 'helper')

      // Clear existing events
      db.prepare('DELETE FROM events').run()

      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: `@helper can you assist with #${testTicketId}?`,
      })

      const events = eventsRepository.list({ event_type: 'mention.created' })

      expect(events).toHaveLength(2)
      expect(events.every((event) => event.comment_id === comment.id)).toBe(true)
      expect(
        events.every((event) => event.actor_type === 'user'),
        'User-authored mention events should have actor_type "user"'
      ).toBe(true)
    })

    it('should create comment.added event', () => {
      // Clear existing events
      db.prepare('DELETE FROM events').run()

      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Just a regular comment',
      })

      const events = eventsRepository.list({ event_type: 'comment.added' })

      expect(events).toHaveLength(1)
      expect(events[0]?.comment_id).toBe(comment.id)
      expect(events[0]?.ticket_id).toBe(testTicketId)
    })

    it('should set actor_type to "agent" for agent-authored comments', () => {
      db.prepare('DELETE FROM events').run()

      commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_AGENT_ID,
        body: 'Agent analysis complete',
      })

      const events = eventsRepository.list({ event_type: 'comment.added' })

      expect(events).toHaveLength(1)
      expect(events[0]?.actor_type, 'Agent-authored comment should have actor_type "agent"').toBe('agent')
      expect(events[0]?.actor_id).toBe(TEST_AGENT_ID)
    })

    it('should set actor_type to "user" for user-authored comments', () => {
      db.prepare('DELETE FROM events').run()

      commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'User comment here',
      })

      const events = eventsRepository.list({ event_type: 'comment.added' })

      expect(events).toHaveLength(1)
      expect(events[0]?.actor_type, 'User-authored comment should have actor_type "user"').toBe('user')
    })

    it('should set actor_type to "agent" on mention.created events for agent-authored @mentions', () => {
      db.prepare(
        'INSERT INTO profiles (id, type, name, is_active) VALUES (?, ?, ?, 1)'
      ).run('user-target', 'user', 'target')
      db.prepare('DELETE FROM events').run()

      commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_AGENT_ID,
        body: '@target here is my analysis',
      })

      const events = eventsRepository.list({ event_type: 'mention.created' })

      expect(events).toHaveLength(1)
      expect(events[0]?.actor_type, 'Agent-authored mention should have actor_type "agent"').toBe('agent')
    })
  })

  /*
   * GET TESTS
   */
  describe('get', () => {
    it('should return null for non-existent comment ID', () => {
      const comment = commentsRepository.get(NON_EXISTENT_ID)

      expect(comment).toBeNull()
    })

    it('should return comment by ID', () => {
      const created = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Test comment',
      })

      const comment = commentsRepository.get(created.id)

      expect(comment).not.toBeNull()
      expect(comment?.id).toBe(created.id)
      expect(comment?.body).toBe('Test comment')
      expect(comment?.author.name).toBe('Test User')
    })
  })

  describe('getByTicket', () => {
    it('should return all comments for a ticket in chronological order', () => {
      commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'First comment',
      })
      commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_AGENT_ID,
        body: 'Second comment',
      })
      commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Third comment',
      })

      const comments = commentsRepository.getByTicket(testTicketId)

      expect(comments).toHaveLength(3)
      expect(comments[0]?.body).toBe('First comment')
      expect(comments[0]?.author.name).toBe('Test User')
      expect(comments[1]?.body).toBe('Second comment')
      expect(comments[1]?.author.name).toBe('Test Agent')
      expect(comments[2]?.body).toBe('Third comment')
    })

    it('should return empty array for ticket with no comments', () => {
      const comments = commentsRepository.getByTicket(testTicketId)

      expect(comments).toHaveLength(0)
    })
  })

  /*
   * LIST TESTS
   */
  describe('list', () => {
    beforeEach(() => {
      commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'User comment',
      })
      commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_AGENT_ID,
        body: 'Agent comment',
      })
    })

    it('should return all comments when no filters provided', () => {
      const comments = commentsRepository.list()

      expect(comments).toHaveLength(2)
    })

    it('should filter comments by ticket_id', () => {
      const comments = commentsRepository.list({ ticket_id: testTicketId })

      expect(comments).toHaveLength(2)
      expect(comments.every((c) => c.ticket_id === testTicketId)).toBe(true)
    })

    it('should filter comments by author_id', () => {
      const comments = commentsRepository.list({ author_id: TEST_USER_ID })

      expect(comments).toHaveLength(1)
      expect(comments[0]?.author_id).toBe(TEST_USER_ID)
    })

    it('should filter root comments (parent_id = null)', () => {
      const parent = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Parent',
      })
      commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Reply',
        parent_id: parent.id,
      })

      const rootComments = commentsRepository.list({
        ticket_id: testTicketId,
        parent_id: null,
      })

      // 2 from beforeEach + 1 parent = 3 root comments
      expect(rootComments).toHaveLength(3)
      expect(rootComments.every((c) => c.parent_id === null)).toBe(true)
    })

    it('should filter replies by parent_id', () => {
      const parent = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Parent',
      })
      commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Reply 1',
        parent_id: parent.id,
      })
      commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_AGENT_ID,
        body: 'Reply 2',
        parent_id: parent.id,
      })

      const replies = commentsRepository.list({ parent_id: parent.id })

      expect(replies).toHaveLength(2)
      expect(replies.every((c) => c.parent_id === parent.id)).toBe(true)
    })

    it('should support pagination', () => {
      const page1 = commentsRepository.list({ limit: 1, offset: 0 })
      const page2 = commentsRepository.list({ limit: 1, offset: 1 })

      expect(page1).toHaveLength(1)
      expect(page2).toHaveLength(1)
      expect(page1[0]?.id).not.toBe(page2[0]?.id)
    })
  })

  /*
   * UPDATE TESTS
   */
  describe('update', () => {
    it('should update comment body and set is_edited flag', () => {
      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Original body',
      })

      const updated = commentsRepository.update(comment.id, { body: 'Updated body' })

      expect(updated?.body).toBe('Updated body')
      expect(updated?.is_edited).toBe(true)
    })

    it('should return null when updating non-existent comment', () => {
      const result = commentsRepository.update(NON_EXISTENT_ID, { body: 'New' })

      expect(result).toBeNull()
    })

    it('should return existing comment when update has no fields', () => {
      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Original body',
      })

      const result = commentsRepository.update(comment.id, {})

      expect(result?.id).toBe(comment.id)
      expect(result?.body).toBe(comment.body)
      expect(result?.is_edited).toBe(false)
    })

    it('should re-parse @mentions when body is updated', () => {
      db.prepare(
        'INSERT INTO profiles (id, type, name, is_active) VALUES (?, ?, ?, 1)'
      ).run('user-alice', 'user', 'alice')
      db.prepare(
        'INSERT INTO profiles (id, type, name, is_active) VALUES (?, ?, ?, 1)'
      ).run('user-bob', 'user', 'bob')

      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: '@alice please review',
      })

      // Should have 1 mention initially
      expect(mentionsRepository.getByComment(comment.id)).toHaveLength(1)

      // Update to mention different person
      commentsRepository.update(comment.id, { body: '@bob please review instead' })

      const mentions = mentionsRepository.getByComment(comment.id)
      expect(mentions).toHaveLength(1)
      expect(mentions[0]?.mentioned_profile_id).toBe('user-bob')
    })
  })

  /*
   * DELETE TESTS
   */
  describe('delete', () => {
    it('should delete existing comment and return true', () => {
      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Test comment',
      })

      const deleted = commentsRepository.delete(comment.id)

      expect(deleted).toBe(true)
      expect(commentsRepository.get(comment.id)).toBeNull()
    })

    it('should return false when deleting non-existent comment', () => {
      const deleted = commentsRepository.delete(NON_EXISTENT_ID)

      expect(deleted).toBe(false)
    })

    it('should cascade delete mentions', () => {
      db.prepare(
        'INSERT INTO profiles (id, type, name, is_active) VALUES (?, ?, ?, 1)'
      ).run('mentionable', 'user', 'mentionable')

      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: '@mentionable check this',
      })

      expect(mentionsRepository.getByComment(comment.id)).toHaveLength(1)

      commentsRepository.delete(comment.id)

      expect(mentionsRepository.getByComment(comment.id)).toHaveLength(0)
    })
  })

  /*
   * REPLY COUNT TESTS
   */
  describe('getReplyCount', () => {
    it('should return the number of replies to a comment', () => {
      const parent = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Parent',
      })
      commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Reply 1',
        parent_id: parent.id,
      })
      commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_AGENT_ID,
        body: 'Reply 2',
        parent_id: parent.id,
      })

      const count = commentsRepository.getReplyCount(parent.id)

      expect(count).toBe(2)
    })

    it('should return 0 for comment with no replies', () => {
      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'No replies',
      })

      const count = commentsRepository.getReplyCount(comment.id)

      expect(count).toBe(0)
    })
  })
})
