/**
 * @fileoverview Tests for mentions repository operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { setupTestDb, TEST_USER_ID, TEST_AGENT_ID, TEST_PROJECT_ID } from '../test-utils'
import { mentionsRepository } from '../mentions.repository'

const NON_EXISTENT_ID = 999999

let testCommentId: number
let mentionedTicketId: number

describe('mentionsRepository', () => {
  let cleanup: () => void
  let db: DatabaseType

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    db = setup.db

    const ticketResult = db
      .prepare(
        'INSERT INTO tickets (project_id, author_id, title, status) VALUES (?, ?, ?, ?)'
      )
      .run(TEST_PROJECT_ID, TEST_USER_ID, 'Test Ticket', 'open')
    const ticketId = ticketResult.lastInsertRowid as number

    const commentResult = db
      .prepare('INSERT INTO comments (ticket_id, author_id, body) VALUES (?, ?, ?)')
      .run(ticketId, TEST_USER_ID, 'Test comment with mentions')
    testCommentId = commentResult.lastInsertRowid as number

    const otherTicketResult = db
      .prepare(
        'INSERT INTO tickets (project_id, author_id, title, status) VALUES (?, ?, ?, ?)'
      )
      .run(TEST_PROJECT_ID, TEST_USER_ID, 'Mentioned Ticket', 'open')
    mentionedTicketId = otherTicketResult.lastInsertRowid as number
  })

  afterEach(() => {
    cleanup()
  })

  describe('create', () => {
    it('should create a profile mention', () => {
      const mention = mentionsRepository.create({
        comment_id: testCommentId,
        mention_type: 'profile',
        mentioned_profile_id: TEST_AGENT_ID,
        mention_text: '@test-agent',
      })

      expect(mention.id).toBeDefined()
      expect(mention.comment_id).toBe(testCommentId)
      expect(mention.mention_type).toBe('profile')
      expect(mention.mentioned_profile_id).toBe(TEST_AGENT_ID)
      expect(mention.mentioned_ticket_id).toBeNull()
    })

    it('should create a ticket mention', () => {
      const mention = mentionsRepository.create({
        comment_id: testCommentId,
        mention_type: 'ticket',
        mentioned_ticket_id: mentionedTicketId,
        mention_text: `#${mentionedTicketId}`,
      })

      expect(mention.mention_type).toBe('ticket')
      expect(mention.mentioned_profile_id).toBeNull()
      expect(mention.mentioned_ticket_id).toBe(mentionedTicketId)
    })
  })

  describe('createBatch', () => {
    it('should create multiple mixed mentions at once', () => {
      const mentions = mentionsRepository.createBatch([
        {
          comment_id: testCommentId,
          mention_type: 'profile',
          mentioned_profile_id: TEST_AGENT_ID,
          mention_text: '@agent',
        },
        {
          comment_id: testCommentId,
          mention_type: 'ticket',
          mentioned_ticket_id: mentionedTicketId,
          mention_text: `#${mentionedTicketId}`,
        },
      ])

      expect(mentions).toHaveLength(2)
      expect(mentions[0]?.mention_type).toBe('profile')
      expect(mentions[1]?.mention_type).toBe('ticket')
    })
  })

  describe('get/getByComment', () => {
    it('should return null for non-existent mention ID', () => {
      expect(mentionsRepository.get(NON_EXISTENT_ID)).toBeNull()
    })

    it('should return all mentions in a comment', () => {
      mentionsRepository.create({
        comment_id: testCommentId,
        mention_type: 'profile',
        mentioned_profile_id: TEST_AGENT_ID,
        mention_text: '@agent',
      })
      mentionsRepository.create({
        comment_id: testCommentId,
        mention_type: 'ticket',
        mentioned_ticket_id: mentionedTicketId,
        mention_text: `#${mentionedTicketId}`,
      })

      const mentions = mentionsRepository.getByComment(testCommentId)
      expect(mentions).toHaveLength(2)
      expect(mentions.every((m) => m.comment_id === testCommentId)).toBe(true)
    })
  })

  describe('getByProfile/getByTicket', () => {
    it('should return all mentions of a profile', () => {
      mentionsRepository.create({
        comment_id: testCommentId,
        mention_type: 'profile',
        mentioned_profile_id: TEST_AGENT_ID,
        mention_text: '@agent',
      })

      const mentions = mentionsRepository.getByProfile(TEST_AGENT_ID)
      expect(mentions).toHaveLength(1)
      expect(mentions[0]?.mention_type).toBe('profile')
      expect(mentions[0]?.mentioned_profile_id).toBe(TEST_AGENT_ID)
    })

    it('should return all mentions of a ticket', () => {
      mentionsRepository.create({
        comment_id: testCommentId,
        mention_type: 'ticket',
        mentioned_ticket_id: mentionedTicketId,
        mention_text: `#${mentionedTicketId}`,
      })

      const mentions = mentionsRepository.getByTicket(mentionedTicketId)
      expect(mentions).toHaveLength(1)
      expect(mentions[0]?.mention_type).toBe('ticket')
      expect(mentions[0]?.mentioned_ticket_id).toBe(mentionedTicketId)
    })
  })

  describe('list', () => {
    beforeEach(() => {
      mentionsRepository.create({
        comment_id: testCommentId,
        mention_type: 'profile',
        mentioned_profile_id: TEST_AGENT_ID,
        mention_text: '@agent',
      })
      mentionsRepository.create({
        comment_id: testCommentId,
        mention_type: 'ticket',
        mentioned_ticket_id: mentionedTicketId,
        mention_text: `#${mentionedTicketId}`,
      })
    })

    it('should filter by mention_type', () => {
      const mentions = mentionsRepository.list({ mention_type: 'profile' })
      expect(mentions).toHaveLength(1)
      expect(mentions[0]?.mention_type).toBe('profile')
    })

    it('should filter by mentioned_profile_id', () => {
      const mentions = mentionsRepository.list({
        mentioned_profile_id: TEST_AGENT_ID,
      })
      expect(mentions).toHaveLength(1)
      expect(mentions[0]?.mentioned_profile_id).toBe(TEST_AGENT_ID)
    })

    it('should filter by mentioned_ticket_id', () => {
      const mentions = mentionsRepository.list({
        mentioned_ticket_id: mentionedTicketId,
      })
      expect(mentions).toHaveLength(1)
      expect(mentions[0]?.mentioned_ticket_id).toBe(mentionedTicketId)
    })
  })

  describe('delete/deleteByComment', () => {
    it('should delete existing mention and return true', () => {
      const mention = mentionsRepository.create({
        comment_id: testCommentId,
        mention_type: 'profile',
        mentioned_profile_id: TEST_AGENT_ID,
        mention_text: '@agent',
      })

      expect(mentionsRepository.delete(mention.id)).toBe(true)
      expect(mentionsRepository.get(mention.id)).toBeNull()
    })

    it('should delete all mentions for a comment', () => {
      mentionsRepository.create({
        comment_id: testCommentId,
        mention_type: 'profile',
        mentioned_profile_id: TEST_AGENT_ID,
        mention_text: '@agent',
      })
      mentionsRepository.create({
        comment_id: testCommentId,
        mention_type: 'ticket',
        mentioned_ticket_id: mentionedTicketId,
        mention_text: `#${mentionedTicketId}`,
      })

      expect(mentionsRepository.deleteByComment(testCommentId)).toBe(2)
      expect(mentionsRepository.getByComment(testCommentId)).toHaveLength(0)
    })
  })
})
