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

    it('should parse new-format @[name](id) mentions and create mention records', () => {
      db.prepare(
        'INSERT INTO profiles (id, type, name, is_active) VALUES (?, ?, ?, 1)'
      ).run('mentionable-user', 'user', 'Mentionable User')

      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Hey @[Mentionable User](mentionable-user) can you look at this?',
      })

      const mentions = mentionsRepository.getByComment(comment.id)

      expect(mentions).toHaveLength(1)
      expect(mentions[0]?.mention_type).toBe('profile')
      expect(mentions[0]?.mentioned_profile_id).toBe('mentionable-user')
      expect(mentions[0]?.mention_text).toBe('@Mentionable User')
    })

    it('should handle multiple new-format mentions', () => {
      db.prepare(
        'INSERT INTO profiles (id, type, name, is_active) VALUES (?, ?, ?, 1)'
      ).run('user-alice', 'user', 'Alice Smith')
      db.prepare(
        'INSERT INTO profiles (id, type, name, is_active) VALUES (?, ?, ?, 1)'
      ).run('user-bob', 'user', 'Bob Jones')

      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: '@[Alice Smith](user-alice) and @[Bob Jones](user-bob) please review this',
      })

      const mentions = mentionsRepository.getByComment(comment.id)

      expect(mentions).toHaveLength(2)
      expect(mentions.map((m) => m.mentioned_profile_id).sort()).toEqual([
        'user-alice',
        'user-bob',
      ])
    })

    it('should deduplicate new-format mentions for same profile', () => {
      db.prepare(
        'INSERT INTO profiles (id, type, name, is_active) VALUES (?, ?, ?, 1)'
      ).run('user-claude', 'user', 'Claude')

      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: '@[Claude](user-claude) please look. What do you think @[Claude](user-claude)?',
      })

      const mentions = mentionsRepository.getByComment(comment.id)
      expect(mentions, 'Should deduplicate new-format mentions').toHaveLength(1)
    })

    it('should handle mixed legacy and new-format mentions', () => {
      db.prepare(
        'INSERT INTO profiles (id, type, name, is_active) VALUES (?, ?, ?, 1)'
      ).run('user-alice', 'user', 'alice')
      db.prepare(
        'INSERT INTO profiles (id, type, name, is_active) VALUES (?, ?, ?, 1)'
      ).run('agent-coding', 'agent', 'Coding Agent')

      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: '@alice and @[Coding Agent](agent-coding) please review this',
      })

      const mentions = mentionsRepository.getByComment(comment.id)
      expect(mentions).toHaveLength(2)
      expect(mentions.map((m) => m.mentioned_profile_id).sort()).toEqual([
        'agent-coding',
        'user-alice',
      ])
    })

    it('should ignore new-format mentions with non-existent profile ID', () => {
      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Hey @[Ghost](non-existent-id) check this out',
      })

      const mentions = mentionsRepository.getByComment(comment.id)
      expect(mentions).toHaveLength(0)
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

    describe('cross-reference events', () => {
      it('should create a cross-reference event on the mentioned ticket timeline', () => {
        const targetTicket = ticketsRepository.create({
          title: 'Target Ticket',
          project_id: TEST_PROJECT_ID,
          author_id: TEST_USER_ID,
        })

        db.prepare('DELETE FROM events').run()

        commentsRepository.create({
          ticket_id: testTicketId,
          author_id: TEST_USER_ID,
          body: `See also #${targetTicket.id}`,
        })

        const targetEvents = eventsRepository.getByTicket(targetTicket.id)
        const crossRefEvents = targetEvents.filter((e) => {
          const payload = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload
          return e.event_type === 'mention.created' && payload.mention_type === 'ticket_cross_reference'
        })

        expect(crossRefEvents).toHaveLength(1)
        const payload = typeof crossRefEvents[0]!.payload === 'string'
          ? JSON.parse(crossRefEvents[0]!.payload)
          : crossRefEvents[0]!.payload
        expect(payload.source_ticket_id).toBe(testTicketId)
        expect(payload.mention_text).toBe(`#${testTicketId}`)
      })

      it('should NOT create a cross-reference event for self-referencing ticket mentions', () => {
        db.prepare('DELETE FROM events').run()

        commentsRepository.create({
          ticket_id: testTicketId,
          author_id: TEST_USER_ID,
          body: `Referencing myself #${testTicketId}`,
        })

        const events = eventsRepository.list({ event_type: 'mention.created' })
        expect(events, 'Only the outbound mention event should exist').toHaveLength(1)
        expect(events[0]!.ticket_id).toBe(testTicketId)

        const payload = typeof events[0]!.payload === 'string'
          ? JSON.parse(events[0]!.payload)
          : events[0]!.payload
        expect(payload.mention_type).toBe('ticket')
      })

      it('should create cross-reference events for multiple mentioned tickets', () => {
        const target1 = ticketsRepository.create({
          title: 'Target 1',
          project_id: TEST_PROJECT_ID,
          author_id: TEST_USER_ID,
        })
        const target2 = ticketsRepository.create({
          title: 'Target 2',
          project_id: TEST_PROJECT_ID,
          author_id: TEST_USER_ID,
        })

        db.prepare('DELETE FROM events').run()

        commentsRepository.create({
          ticket_id: testTicketId,
          author_id: TEST_USER_ID,
          body: `Related to #${target1.id} and #${target2.id}`,
        })

        const target1CrossRefs = eventsRepository.getByTicket(target1.id).filter((e) => {
          const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload
          return p.mention_type === 'ticket_cross_reference'
        })
        const target2CrossRefs = eventsRepository.getByTicket(target2.id).filter((e) => {
          const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload
          return p.mention_type === 'ticket_cross_reference'
        })

        expect(target1CrossRefs).toHaveLength(1)
        expect(target2CrossRefs).toHaveLength(1)
      })

      it('should create cross-reference events only for newly added mentions on comment edit', () => {
        const target1 = ticketsRepository.create({
          title: 'Target Edit 1',
          project_id: TEST_PROJECT_ID,
          author_id: TEST_USER_ID,
        })
        const target2 = ticketsRepository.create({
          title: 'Target Edit 2',
          project_id: TEST_PROJECT_ID,
          author_id: TEST_USER_ID,
        })

        const comment = commentsRepository.create({
          ticket_id: testTicketId,
          author_id: TEST_USER_ID,
          body: `See #${target1.id}`,
        })

        db.prepare('DELETE FROM events').run()

        commentsRepository.update(comment.id, {
          body: `See #${target1.id} and also #${target2.id}`,
        })

        // target1 should NOT get a new cross-reference (already mentioned before edit)
        const target1CrossRefs = eventsRepository.getByTicket(target1.id).filter((e) => {
          const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload
          return p.mention_type === 'ticket_cross_reference'
        })
        expect(target1CrossRefs, 'Pre-existing mention should not create new cross-reference').toHaveLength(0)

        // target2 SHOULD get a cross-reference (newly added)
        const target2CrossRefs = eventsRepository.getByTicket(target2.id).filter((e) => {
          const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload
          return p.mention_type === 'ticket_cross_reference'
        })
        expect(target2CrossRefs, 'Newly added mention should create cross-reference').toHaveLength(1)
      })

      it('should NOT create a cross-reference event for non-existent ticket mentions', () => {
        db.prepare('DELETE FROM events').run()

        commentsRepository.create({
          ticket_id: testTicketId,
          author_id: TEST_USER_ID,
          body: 'See #99999 for details',
        })

        const events = eventsRepository.list({ event_type: 'mention.created' })
        expect(events, 'No mention events for non-existent ticket').toHaveLength(0)

        const mentions = mentionsRepository.getByComment(
          commentsRepository.list({ ticket_id: testTicketId }).at(-1)!.id
        )
        const ticketMentions = mentions.filter((m) => m.mention_type === 'ticket')
        expect(ticketMentions, 'No mention records for non-existent ticket').toHaveLength(0)
      })

      it('should NOT create a duplicate cross-reference event when a second comment on the same ticket mentions the same target', () => {
        const targetTicket = ticketsRepository.create({
          title: 'Dedup Target',
          project_id: TEST_PROJECT_ID,
          author_id: TEST_USER_ID,
        })

        db.prepare('DELETE FROM events').run()

        commentsRepository.create({
          ticket_id: testTicketId,
          author_id: TEST_USER_ID,
          body: `First mention of #${targetTicket.id}`,
        })

        commentsRepository.create({
          ticket_id: testTicketId,
          author_id: TEST_AGENT_ID,
          body: `Second mention of #${targetTicket.id}`,
        })

        const targetEvents = eventsRepository.getByTicket(targetTicket.id)
        const crossRefEvents = targetEvents.filter((e) => {
          const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload
          return e.event_type === 'mention.created' && p.mention_type === 'ticket_cross_reference'
        })

        expect(crossRefEvents, 'Only one cross-reference event per source→target pair').toHaveLength(1)
      })

      it('should still create cross-reference events from different source tickets', () => {
        const targetTicket = ticketsRepository.create({
          title: 'Multi-Source Target',
          project_id: TEST_PROJECT_ID,
          author_id: TEST_USER_ID,
        })
        const sourceTicket2 = ticketsRepository.create({
          title: 'Second Source',
          project_id: TEST_PROJECT_ID,
          author_id: TEST_USER_ID,
        })

        db.prepare('DELETE FROM events').run()

        commentsRepository.create({
          ticket_id: testTicketId,
          author_id: TEST_USER_ID,
          body: `From source 1: #${targetTicket.id}`,
        })

        commentsRepository.create({
          ticket_id: sourceTicket2.id,
          author_id: TEST_USER_ID,
          body: `From source 2: #${targetTicket.id}`,
        })

        const targetEvents = eventsRepository.getByTicket(targetTicket.id)
        const crossRefEvents = targetEvents.filter((e) => {
          const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload
          return e.event_type === 'mention.created' && p.mention_type === 'ticket_cross_reference'
        })

        expect(crossRefEvents, 'One cross-reference per unique source ticket').toHaveLength(2)
      })
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

    it('should re-parse new-format mentions when body is updated', () => {
      db.prepare(
        'INSERT INTO profiles (id, type, name, is_active) VALUES (?, ?, ?, 1)'
      ).run('user-alice', 'user', 'Alice Smith')
      db.prepare(
        'INSERT INTO profiles (id, type, name, is_active) VALUES (?, ?, ?, 1)'
      ).run('user-bob', 'user', 'Bob Jones')

      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: '@[Alice Smith](user-alice) please review',
      })

      expect(mentionsRepository.getByComment(comment.id)).toHaveLength(1)

      commentsRepository.update(comment.id, {
        body: '@[Bob Jones](user-bob) please review instead',
      })

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

    it('should set parent_id to NULL on replies when parent is deleted', () => {
      const parent = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Parent comment',
      })

      const reply1 = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Reply 1',
        parent_id: parent.id,
      })

      const reply2 = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_AGENT_ID,
        body: 'Reply 2',
        parent_id: parent.id,
      })

      const deleted = commentsRepository.delete(parent.id)
      expect(deleted).toBe(true)

      const fetchedReply1 = commentsRepository.get(reply1.id)
      const fetchedReply2 = commentsRepository.get(reply2.id)

      expect(fetchedReply1, 'Reply 1 should not be deleted').not.toBeNull()
      expect(fetchedReply2, 'Reply 2 should not be deleted').not.toBeNull()
      expect(fetchedReply1!.parent_id, 'Reply 1 parent_id should be NULL').toBeNull()
      expect(fetchedReply2!.parent_id, 'Reply 2 parent_id should be NULL').toBeNull()
    })

    it('should emit comment.deleted event', () => {
      const comment = commentsRepository.create({
        ticket_id: testTicketId,
        author_id: TEST_USER_ID,
        body: 'Comment to delete',
      })

      db.prepare('DELETE FROM events').run()

      commentsRepository.delete(comment.id)

      const events = eventsRepository.list({ event_type: 'comment.deleted' })

      expect(events).toHaveLength(1)
      expect(events[0]?.ticket_id).toBe(testTicketId)
      expect(events[0]?.actor_id).toBe(TEST_USER_ID)
      expect(events[0]?.actor_type).toBe('user')

      const payload = JSON.parse(events[0]!.payload)
      expect(payload.comment_id).toBe(comment.id)
      expect(payload.ticket_id).toBe(testTicketId)
    })

    it('should not emit event when deleting non-existent comment', () => {
      db.prepare('DELETE FROM events').run()

      const deleted = commentsRepository.delete(NON_EXISTENT_ID)

      expect(deleted).toBe(false)

      const events = eventsRepository.list({ event_type: 'comment.deleted' })
      expect(events).toHaveLength(0)
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
