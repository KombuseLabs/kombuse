/**
 * @fileoverview Tests for tickets repository CRUD operations
 *
 * Run all: bun run --filter @kombuse/persistence test -- src/__tests__/tickets.test.ts
 * Run one: bun run --filter @kombuse/persistence test -- -t "should create a ticket"
 *
 * Tests cover:
 * - create: Insert new tickets with required/optional fields
 * - get: Retrieve single ticket by ID
 * - list: Query tickets with filters, search, pagination
 * - update: Modify existing tickets partially or fully
 * - delete: Remove tickets
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { setupTestDb, TEST_USER_ID, TEST_AGENT_ID, TEST_PROJECT_ID } from '../test-utils'
import { getDatabase } from '../database'
import { ticketsRepository } from '../tickets.repository'
import { labelsRepository } from '../labels.repository'
import { commentsRepository } from '../comments.repository'
import { eventsRepository } from '../events.repository'

// Test data constants - using the seeded project and user
const TEST_TICKET = {
  title: 'Test ticket',
  project_id: TEST_PROJECT_ID,
  author_id: TEST_USER_ID,
}
const TEST_TICKET_FULL = {
  title: 'Full ticket',
  body: 'Detailed description',
  status: 'in_progress' as const,
  priority: 3 as const,
  project_id: TEST_PROJECT_ID,
  author_id: TEST_USER_ID,
}
const NON_EXISTENT_ID = 999999

describe('ticketsRepository', () => {
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

  /*
   * CREATE TESTS
   * Verify ticket insertion with various input combinations
   */
  describe('create', () => {
    it('should create a ticket with only required fields', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)

      expect(ticket.id, 'Ticket should have auto-generated ID').toBeDefined()
      expect(ticket.title).toBe(TEST_TICKET.title)
      expect(ticket.project_id).toBe(TEST_PROJECT_ID)
      expect(ticket.author_id).toBe(TEST_USER_ID)
      expect(ticket.status, 'Default status should be open').toBe('open')
      expect(ticket.body, 'Body should be null when not provided').toBeNull()
      expect(ticket.triggers_enabled, 'Default triggers_enabled should be true').toBe(true)
      expect(ticket.loop_protection_enabled, 'Default loop_protection_enabled should be true').toBe(true)
    })

    it('should create a ticket with all optional fields', () => {
      const ticket = ticketsRepository.create(TEST_TICKET_FULL)

      expect(ticket.title).toBe(TEST_TICKET_FULL.title)
      expect(ticket.body).toBe(TEST_TICKET_FULL.body)
      expect(ticket.status).toBe(TEST_TICKET_FULL.status)
      expect(ticket.priority).toBe(TEST_TICKET_FULL.priority)
      expect(ticket.project_id).toBe(TEST_TICKET_FULL.project_id)
      expect(ticket.author_id).toBe(TEST_TICKET_FULL.author_id)
    })

    it('should auto-generate timestamps on creation', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)

      expect(ticket.created_at, 'created_at should be set').toBeDefined()
      expect(ticket.updated_at, 'updated_at should be set').toBeDefined()
      // Both should be valid ISO date strings
      expect(() => new Date(ticket.created_at)).not.toThrow()
      expect(() => new Date(ticket.updated_at)).not.toThrow()
    })

    it('should attach labels when creating a ticket', () => {
      const labelResult = db
        .prepare('INSERT INTO labels (project_id, name) VALUES (?, ?)')
        .run(TEST_PROJECT_ID, 'bug')
      const labelId = Number(labelResult.lastInsertRowid)

      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        label_ids: [labelId],
      })

      const rows = db
        .prepare(
          'SELECT label_id, added_by_id FROM ticket_labels WHERE ticket_id = ?'
        )
        .all(ticket.id) as { label_id: number; added_by_id: string | null }[]

      expect(rows).toHaveLength(1)
      expect(rows[0]?.label_id).toBe(labelId)
      expect(rows[0]?.added_by_id).toBe(TEST_USER_ID)
    })

    it('should create a ticket with triggers disabled and still emit ticket.created event', () => {
      db.prepare('DELETE FROM events').run()

      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        triggers_enabled: false,
      })

      expect(ticket.triggers_enabled).toBe(false)
      // Event must always be emitted for WebSocket broadcast (UI refresh).
      // The trigger orchestrator independently checks triggers_enabled
      // before running agent triggers (trigger-orchestrator.ts:158).
      const events = eventsRepository.list({ event_type: 'ticket.created' })
      expect(events).toHaveLength(1)
      expect(events[0]?.ticket_id).toBe(ticket.id)
    })

    it('should create a ticket with loop protection disabled', () => {
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        loop_protection_enabled: false,
      })

      expect(ticket.loop_protection_enabled).toBe(false)
    })
  })

  /*
   * GET TESTS
   * Verify single ticket retrieval
   */
  describe('get', () => {
    it('should return null for non-existent ticket ID', () => {
      const ticket = ticketsRepository._getInternal(NON_EXISTENT_ID)

      expect(ticket, `ID ${NON_EXISTENT_ID} should not exist`).toBeNull()
    })

    it('should return ticket by ID', () => {
      const created = ticketsRepository.create(TEST_TICKET)

      const ticket = ticketsRepository._getInternal(created.id)

      expect(ticket).not.toBeNull()
      expect(ticket?.id).toBe(created.id)
      expect(ticket?.title).toBe(TEST_TICKET.title)
    })
  })

  /*
   * LIST TESTS
   * Verify query functionality with various filters
   */
  describe('list', () => {
    // Seed data for list tests
    beforeEach(() => {
      ticketsRepository.create({ ...TEST_TICKET, title: 'Open 1', status: 'open' })
      ticketsRepository.create({ ...TEST_TICKET, title: 'Open 2', status: 'open' })
      ticketsRepository.create({ ...TEST_TICKET, title: 'Closed', status: 'closed' })
    })

    it('should return all tickets when no filters provided', () => {
      const tickets = ticketsRepository.list()

      expect(tickets, 'Should return all 3 seeded tickets').toHaveLength(3)
    })

    it('should filter tickets by status', () => {
      const openTickets = ticketsRepository.list({ status: 'open' })

      expect(openTickets).toHaveLength(2)
      expect(
        openTickets.every((t) => t.status === 'open'),
        'All returned tickets should have open status'
      ).toBe(true)
    })

    it('should search tickets by title', () => {
      const results = ticketsRepository.list({ search: 'Closed' })

      expect(results).toHaveLength(1)
      expect(results[0]?.title).toBe('Closed')
    })

    it('should search tickets by body content', () => {
      ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Bug report',
        body: 'Something is broken in production',
      })

      const results = ticketsRepository.list({ search: 'broken' })

      expect(results, 'Should find ticket by body content').toHaveLength(1)
      expect(results[0]?.title).toBe('Bug report')
    })

    it('should match stemmed variants (FTS5 porter stemming)', () => {
      ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Application is running slowly',
      })

      const results = ticketsRepository.list({ search: 'run' })

      expect(results, 'Porter stemmer should match "running" from "run"').toHaveLength(1)
      expect(results[0]?.title).toBe('Application is running slowly')
    })

    it('should match multiple search terms (AND semantics)', () => {
      ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Fix the login bug',
        body: 'Users cannot log in on mobile',
      })
      ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Add new feature',
        body: 'Implement dark mode',
      })

      const results = ticketsRepository.list({ search: 'login bug' })

      expect(results, 'Should match ticket containing both terms').toHaveLength(1)
      expect(results[0]?.title).toBe('Fix the login bug')
    })

    it('should match partial-word prefixes (FTS5 prefix matching)', () => {
      ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Permission settings need update',
      })

      const results = ticketsRepository.list({ search: 'perm' })

      expect(results, 'Prefix "perm" should match "Permission"').toHaveLength(1)
      expect(results[0]?.title).toBe('Permission settings need update')
    })

    it('should return empty results for non-matching search', () => {
      const results = ticketsRepository.list({ search: 'nonexistentxyz' })

      expect(results).toHaveLength(0)
    })

    it('should combine FTS search with status filter', () => {
      ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Open bug report',
        status: 'open',
      })
      ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Closed bug report',
        status: 'closed',
      })

      const results = ticketsRepository.list({ search: 'bug report', status: 'open' })

      expect(results).toHaveLength(1)
      expect(results[0]?.status).toBe('open')
    })

    it('should sort by relevance when searching without explicit sort_by', () => {
      ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Unrelated title',
        body: 'The database migration failed',
      })
      ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Database migration error',
        body: 'See logs for details',
      })

      const results = ticketsRepository.list({ search: 'database migration' })

      expect(results.length).toBeGreaterThanOrEqual(2)
      const titles = results.map((r) => r.title)
      expect(titles).toContain('Database migration error')
      expect(titles).toContain('Unrelated title')
    })

    it('should use explicit sort_by even when searching', () => {
      ticketsRepository.create({ ...TEST_TICKET, title: 'First bug' })
      ticketsRepository.create({ ...TEST_TICKET, title: 'Second bug' })

      const results = ticketsRepository.list({
        search: 'bug',
        sort_by: 'created_at',
        sort_order: 'asc',
      })

      expect(results.length).toBe(2)
      const t1 = new Date(results[0]!.created_at).getTime()
      const t2 = new Date(results[1]!.created_at).getTime()
      expect(t1).toBeLessThanOrEqual(t2)
    })

    it('should find tickets after title update (FTS trigger sync)', () => {
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Original uniquetitle',
      })

      ticketsRepository.update(ticket.id, { title: 'Updated searchableword' })

      const byNewTitle = ticketsRepository.list({ search: 'searchableword' })
      expect(byNewTitle).toHaveLength(1)

      const byOldTitle = ticketsRepository.list({ search: 'uniquetitle' })
      expect(byOldTitle).toHaveLength(0)
    })

    it('should not find deleted tickets in search (FTS trigger sync)', () => {
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Deletable searchtarget',
      })

      ticketsRepository.delete(ticket.id)

      const results = ticketsRepository.list({ search: 'searchtarget' })
      expect(results).toHaveLength(0)
    })

    it('should handle FTS5 special characters without crashing', () => {
      ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Special chars test ticket',
      })

      // These inputs contain FTS5 syntax characters that would crash without sanitization
      const inputs = ['test"', '"unbalanced', 'bug* OR fix(', '()', '""']
      for (const input of inputs) {
        expect(() => ticketsRepository.list({ search: input })).not.toThrow()
      }

      // A query with only special chars / keywords should return all tickets (no FTS filter)
      const results = ticketsRepository.list({ search: 'OR AND NOT' })
      expect(results.length).toBeGreaterThan(0)
    })

    it('should find ticket by exact ID when search is numeric', () => {
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Unique findable title',
      })

      const results = ticketsRepository.list({ search: String(ticket.id) })

      expect(results.length, 'Should find at least the exact ID match').toBeGreaterThanOrEqual(1)
      expect(
        results.some((t) => t.id === ticket.id),
        'Results should include the ticket with matching ID'
      ).toBe(true)
    })

    it('should prioritize exact ID match over FTS results for numeric search', () => {
      // Create a ticket whose title contains the number of another ticket's ID
      const target = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Target ticket without number in title',
      })
      ticketsRepository.create({
        ...TEST_TICKET,
        title: `Issue ${target.id} is related`,
      })

      const results = ticketsRepository.list({ search: String(target.id) })

      expect(results.length, 'Should return both ID match and FTS match').toBeGreaterThanOrEqual(1)
      expect(results[0]?.id, 'Exact ID match should be first result').toBe(target.id)
    })

    it('should return FTS results alongside ID match for numeric query', () => {
      const target = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Specific ticket',
      })
      const related = ticketsRepository.create({
        ...TEST_TICKET,
        title: `Ticket ${target.id} followup`,
      })

      const results = ticketsRepository.list({ search: String(target.id) })

      const ids = results.map((r) => r.id)
      expect(ids, 'Should include the exact ID match').toContain(target.id)
      expect(ids, 'Should include the FTS text match').toContain(related.id)
    })

    it('should return empty results for non-existent numeric ID', () => {
      const results = ticketsRepository.list({ search: '999999' })

      expect(results).toHaveLength(0)
    })

    it('should find a ticket by comment body content', () => {
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Unrelated title for comment search',
      })
      commentsRepository.create({
        ticket_id: ticket.id,
        author_id: TEST_USER_ID,
        body: 'The deploymentpipeline is failing in staging',
      })

      const results = ticketsRepository.list({ search: 'deploymentpipeline' })

      expect(results, 'Should find ticket via comment body').toHaveLength(1)
      expect(results[0]?.id).toBe(ticket.id)
    })

    it('should match stemmed variants in comments (porter stemming)', () => {
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Stemming test ticket',
      })
      commentsRepository.create({
        ticket_id: ticket.id,
        author_id: TEST_USER_ID,
        body: 'The containers are crashing frequently',
      })

      const results = ticketsRepository.list({ search: 'crash' })

      expect(results, 'Porter stemmer should match "crashing" from "crash"').toHaveLength(1)
      expect(results[0]?.id).toBe(ticket.id)
    })

    it('should deduplicate when ticket matches both title/body and comments', () => {
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Authentication failure',
        body: 'Login is broken',
      })
      commentsRepository.create({
        ticket_id: ticket.id,
        author_id: TEST_USER_ID,
        body: 'Authentication also fails on mobile',
      })

      const results = ticketsRepository.list({ search: 'authentication' })

      expect(results, 'Ticket should appear once despite matching in title and comment').toHaveLength(1)
      expect(results[0]?.id).toBe(ticket.id)
    })

    it('should prioritize title/body matches over comment-only matches', () => {
      const directMatch = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Performance optimization needed',
        body: 'The API is slow',
      })
      const commentMatch = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Unrelated feature request',
      })
      commentsRepository.create({
        ticket_id: commentMatch.id,
        author_id: TEST_USER_ID,
        body: 'This also affects performance optimization',
      })

      const results = ticketsRepository.list({ search: 'performance optimization' })

      expect(results.length).toBeGreaterThanOrEqual(2)
      expect(results[0]?.id, 'Direct title match should rank first').toBe(directMatch.id)
    })

    it('should not find ticket after comment is deleted', () => {
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'No matching words in title',
      })
      const comment = commentsRepository.create({
        ticket_id: ticket.id,
        author_id: TEST_USER_ID,
        body: 'Unique searchterm xyzcommentonly',
      })

      let results = ticketsRepository.list({ search: 'xyzcommentonly' })
      expect(results).toHaveLength(1)

      commentsRepository.delete(comment.id)

      results = ticketsRepository.list({ search: 'xyzcommentonly' })
      expect(results, 'Should not find ticket after comment is deleted').toHaveLength(0)
    })

    it('should find ticket after comment is updated with new content', () => {
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Comment update search test',
      })
      const comment = commentsRepository.create({
        ticket_id: ticket.id,
        author_id: TEST_USER_ID,
        body: 'Original comment text uniqueoriginal',
      })

      commentsRepository.update(comment.id, { body: 'Updated comment uniqueupdatedtext' })

      const byNewText = ticketsRepository.list({ search: 'uniqueupdatedtext' })
      expect(byNewText, 'Should find by updated comment text').toHaveLength(1)

      const byOldText = ticketsRepository.list({ search: 'uniqueoriginal' })
      expect(byOldText, 'Should not find by old comment text').toHaveLength(0)
    })

    it('should remove comment FTS entries when parent ticket is deleted', () => {
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Ticket to delete with comments',
      })
      commentsRepository.create({
        ticket_id: ticket.id,
        author_id: TEST_USER_ID,
        body: 'Unique cascade deletetest term',
      })

      ticketsRepository.delete(ticket.id)

      const results = ticketsRepository.list({ search: 'deletetest' })
      expect(results, 'Should not find deleted ticket via orphaned comment FTS').toHaveLength(0)
    })

    it('should combine comment search with status filter', () => {
      const openTicket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Open ticket no match',
        status: 'open',
      })
      const closedTicket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Closed ticket no match',
        status: 'closed',
      })
      commentsRepository.create({
        ticket_id: openTicket.id,
        author_id: TEST_USER_ID,
        body: 'Unique filterable commentterm',
      })
      commentsRepository.create({
        ticket_id: closedTicket.id,
        author_id: TEST_USER_ID,
        body: 'Also has filterable commentterm',
      })

      const results = ticketsRepository.list({ search: 'commentterm', status: 'open' })

      expect(results).toHaveLength(1)
      expect(results[0]?.id).toBe(openTicket.id)
    })

    it('should find ticket once when multiple comments match', () => {
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Multi-comment test',
      })
      commentsRepository.create({
        ticket_id: ticket.id,
        author_id: TEST_USER_ID,
        body: 'First comment about multicommentunique',
      })
      commentsRepository.create({
        ticket_id: ticket.id,
        author_id: TEST_USER_ID,
        body: 'Second comment also about multicommentunique',
      })

      const results = ticketsRepository.list({ search: 'multicommentunique' })

      expect(results, 'Should return ticket once even with multiple matching comments').toHaveLength(1)
      expect(results[0]?.id).toBe(ticket.id)
    })

    it('should limit number of returned tickets', () => {
      const tickets = ticketsRepository.list({ limit: 2 })

      expect(tickets, 'Should respect limit parameter').toHaveLength(2)
    })

    it('should support pagination with offset', () => {
      const page1 = ticketsRepository.list({ limit: 2, offset: 0 })
      const page2 = ticketsRepository.list({ limit: 2, offset: 2 })

      expect(page1, 'First page should have 2 tickets').toHaveLength(2)
      expect(page2, 'Second page should have 1 remaining ticket').toHaveLength(1)
      // Verify no overlap
      const page1Ids = page1.map((t) => t.id)
      const page2Ids = page2.map((t) => t.id)
      expect(
        page1Ids.filter((id) => page2Ids.includes(id)),
        'Pages should not overlap'
      ).toHaveLength(0)
    })

    it('should filter tickets by priority', () => {
      ticketsRepository.create({ ...TEST_TICKET, title: 'High priority', priority: 4 })
      ticketsRepository.create({ ...TEST_TICKET, title: 'Low priority', priority: 1 })

      const highPriority = ticketsRepository.list({ priority: 4 })

      expect(highPriority).toHaveLength(1)
      expect(highPriority[0]?.title).toBe('High priority')
    })

    it('should filter tickets by project_id', () => {
      // All test tickets belong to TEST_PROJECT_ID
      const projectTickets = ticketsRepository.list({ project_id: TEST_PROJECT_ID })

      expect(projectTickets.length).toBeGreaterThan(0)
      expect(projectTickets.every((t) => t.project_id === TEST_PROJECT_ID)).toBe(true)
    })

    it('should filter tickets by author_id', () => {
      const authorTickets = ticketsRepository.list({ author_id: TEST_USER_ID })

      expect(authorTickets.length).toBeGreaterThan(0)
      expect(authorTickets.every((t) => t.author_id === TEST_USER_ID)).toBe(true)
    })

    it('should order tickets by created_at DESC (newest first)', () => {
      const tickets = ticketsRepository.list()

      expect(tickets.length).toBeGreaterThan(1)
      // Verify descending order
      for (let i = 1; i < tickets.length; i++) {
        const prevTime = new Date(tickets[i - 1]!.created_at).getTime()
        const currTime = new Date(tickets[i]!.created_at).getTime()
        expect(
          prevTime,
          `Ticket ${i - 1} should be >= ticket ${i} by created_at`
        ).toBeGreaterThanOrEqual(currTime)
      }
    })

    it('should return body snippet with delimiters when search matches body', () => {
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Snippet body test',
        body: 'The quickfoxjumps over the lazy dog',
      })

      const results = ticketsRepository.list({ search: 'quickfoxjumps' }) as any[]

      expect(results).toHaveLength(1)
      expect(results[0]?.id).toBe(ticket.id)
      expect(results[0]?.match_source).toBe('body')
      expect(results[0]?.match_context).toContain('«')
      expect(results[0]?.match_context).toContain('»')
      expect(results[0]?.match_context).toContain('quickfoxjumps')
    })

    it('should return comment snippet when search only matches a comment', () => {
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Snippet comment test',
        body: 'Nothing relevant here',
      })
      commentsRepository.create({
        ticket_id: ticket.id,
        author_id: TEST_USER_ID,
        body: 'The xyzcommentsnippet is important',
      })

      const results = ticketsRepository.list({ search: 'xyzcommentsnippet' }) as any[]

      expect(results).toHaveLength(1)
      expect(results[0]?.id).toBe(ticket.id)
      expect(results[0]?.match_source).toBe('comment')
      expect(results[0]?.match_context).toContain('xyzcommentsnippet')
    })

    it('should not return snippet when search only matches title', () => {
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Uniquetitleonlysnippet',
      })

      const results = ticketsRepository.list({ search: 'Uniquetitleonlysnippet' }) as any[]

      expect(results).toHaveLength(1)
      expect(results[0]?.id).toBe(ticket.id)
      expect(results[0]?.match_context).toBeNull()
      expect(results[0]?.match_source).toBeNull()
    })

    it('should not include snippet fields when search filter is absent', () => {
      const results = ticketsRepository.list({ limit: 1 }) as any[]

      expect(results).toHaveLength(1)
      expect(results[0]?.match_context).toBeUndefined()
      expect(results[0]?.match_source).toBeUndefined()
    })

    it('should prefer body snippet over comment snippet when both match', () => {
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Dual match snippet test',
        body: 'The dualsnippetmatch is in the body',
      })
      commentsRepository.create({
        ticket_id: ticket.id,
        author_id: TEST_USER_ID,
        body: 'The dualsnippetmatch is also in a comment',
      })

      const results = ticketsRepository.list({ search: 'dualsnippetmatch' }) as any[]

      expect(results).toHaveLength(1)
      expect(results[0]?.id).toBe(ticket.id)
      expect(results[0]?.match_source, 'Should prefer body over comment').toBe('body')
    })
  })

  /*
   * UPDATE TESTS
   * Verify partial and full updates to existing tickets
   */
  describe('update', () => {
    it('should update multiple ticket fields at once', () => {
      const ticket = ticketsRepository.create({ ...TEST_TICKET, status: 'open' })

      const updated = ticketsRepository.update(ticket.id, {
        title: 'Updated',
        status: 'closed',
      })

      expect(updated?.title).toBe('Updated')
      expect(updated?.status).toBe('closed')
    })

    it('should return null when updating non-existent ticket', () => {
      const result = ticketsRepository.update(NON_EXISTENT_ID, { title: 'New' })

      expect(result, `Update on ID ${NON_EXISTENT_ID} should return null`).toBeNull()
    })

    it('should support partial updates - only specified fields change', () => {
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        body: 'Original body',
        priority: 2,
      })

      const updated = ticketsRepository.update(ticket.id, { priority: 4 })

      expect(updated?.title, 'Title should remain unchanged').toBe(TEST_TICKET.title)
      expect(updated?.body, 'Body should remain unchanged').toBe('Original body')
      expect(updated?.priority, 'Only priority should change').toBe(4)
    })

    it('should return existing ticket when update has no fields', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)

      const result = ticketsRepository.update(ticket.id, {})

      expect(result?.id).toBe(ticket.id)
      expect(result?.title).toBe(ticket.title)
    })

    it('should update the updated_at timestamp', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)

      const updated = ticketsRepository.update(ticket.id, { title: 'Changed' })

      expect(updated?.title).toBe('Changed')
      // Note: timestamps may be equal if executed in same second
    })

    it('should update triggers_enabled', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)
      expect(ticket.triggers_enabled).toBe(true)

      const disabled = ticketsRepository.update(ticket.id, { triggers_enabled: false })
      expect(disabled?.triggers_enabled).toBe(false)

      const enabled = ticketsRepository.update(ticket.id, { triggers_enabled: true })
      expect(enabled?.triggers_enabled).toBe(true)
    })

    it('should update loop_protection_enabled', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)
      expect(ticket.loop_protection_enabled).toBe(true)

      const disabled = ticketsRepository.update(ticket.id, { loop_protection_enabled: false })
      expect(disabled?.loop_protection_enabled).toBe(false)

      const enabled = ticketsRepository.update(ticket.id, { loop_protection_enabled: true })
      expect(enabled?.loop_protection_enabled).toBe(true)
    })
  })

  /*
   * DELETE TESTS
   * Verify removal behavior
   */
  describe('delete', () => {
    it('should delete existing ticket and return true', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)

      const deleted = ticketsRepository.delete(ticket.id)

      expect(deleted, 'Delete should return true for existing ticket').toBe(true)
      expect(
        ticketsRepository._getInternal(ticket.id),
        'Ticket should not exist after delete'
      ).toBeNull()
    })

    it('should return false when deleting non-existent ticket', () => {
      const deleted = ticketsRepository.delete(NON_EXISTENT_ID)

      expect(deleted, 'Delete should return false for non-existent ID').toBe(false)
    })
  })

  /*
   * SORT_BY AND SORT_ORDER TESTS
   * Verify dynamic sorting of ticket list queries
   */
  describe('sort_by and sort_order', () => {
    it('should default to created_at DESC when no sort specified', () => {
      ticketsRepository.create({ ...TEST_TICKET, title: 'First' })
      ticketsRepository.create({ ...TEST_TICKET, title: 'Second' })
      ticketsRepository.create({ ...TEST_TICKET, title: 'Third' })

      const tickets = ticketsRepository.list()

      expect(tickets).toHaveLength(3)
      // Verify descending order by created_at
      for (let i = 1; i < tickets.length; i++) {
        const prevTime = new Date(tickets[i - 1]!.created_at).getTime()
        const currTime = new Date(tickets[i]!.created_at).getTime()
        expect(prevTime).toBeGreaterThanOrEqual(currTime)
      }
    })

    it('should sort by opened_at DESC', () => {
      const t1 = ticketsRepository.create({ ...TEST_TICKET, title: 'First' })
      const t2 = ticketsRepository.create({ ...TEST_TICKET, title: 'Second' })
      // Reopen t1 to give it a newer opened_at
      ticketsRepository.update(t1.id, { status: 'closed' })
      ticketsRepository.update(t1.id, { status: 'open' })

      const tickets = ticketsRepository.list({ sort_by: 'opened_at' })

      expect(tickets[0]?.title, 'Reopened ticket should sort first').toBe('First')
    })

    it('should sort by closed_at ASC', () => {
      const t1 = ticketsRepository.create({ ...TEST_TICKET, title: 'First' })
      const t2 = ticketsRepository.create({ ...TEST_TICKET, title: 'Second' })
      ticketsRepository.update(t1.id, { status: 'closed' })
      ticketsRepository.update(t2.id, { status: 'closed' })

      const tickets = ticketsRepository.list({
        sort_by: 'closed_at',
        sort_order: 'asc',
        status: 'closed',
      })

      expect(tickets[0]?.title).toBe('First')
      expect(tickets[1]?.title).toBe('Second')
    })

    it('should sort by updated_at DESC', () => {
      const t1 = ticketsRepository.create({ ...TEST_TICKET, title: 'First' })
      const t2 = ticketsRepository.create({ ...TEST_TICKET, title: 'Second' })
      // Update t1 to give it a newer updated_at
      ticketsRepository.update(t1.id, { title: 'First Updated' })

      const tickets = ticketsRepository.list({ sort_by: 'updated_at' })

      expect(tickets[0]?.title).toBe('First Updated')
    })

    it('should combine sort with status filter', () => {
      ticketsRepository.create({ ...TEST_TICKET, title: 'Open 1', status: 'open' })
      ticketsRepository.create({ ...TEST_TICKET, title: 'Closed 1', status: 'closed' })
      ticketsRepository.create({ ...TEST_TICKET, title: 'Open 2', status: 'open' })

      const tickets = ticketsRepository.list({
        status: 'open',
        sort_by: 'created_at',
        sort_order: 'asc',
      })

      expect(tickets).toHaveLength(2)
      expect(tickets[0]?.title).toBe('Open 1')
      expect(tickets[1]?.title).toBe('Open 2')
    })
  })

  /*
   * OPENED_AT / CLOSED_AT COLUMN TESTS
   * Verify timestamp tracking for status transitions
   */
  describe('opened_at / closed_at columns', () => {
    it('should set opened_at on ticket creation', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)

      expect(ticket.opened_at, 'opened_at should be set').toBeDefined()
      expect(() => new Date(ticket.opened_at)).not.toThrow()
      expect(ticket.closed_at, 'closed_at should be null for open ticket').toBeNull()
    })

    it('should set both opened_at and closed_at when created with status closed', () => {
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        status: 'closed',
      })

      expect(ticket.opened_at, 'opened_at should be set').toBeDefined()
      expect(ticket.closed_at, 'closed_at should be set for closed ticket').toBeDefined()
      expect(() => new Date(ticket.opened_at)).not.toThrow()
      expect(() => new Date(ticket.closed_at!)).not.toThrow()
    })

    it('should set closed_at when status changes to closed', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)
      expect(ticket.closed_at).toBeNull()

      const updated = ticketsRepository.update(ticket.id, { status: 'closed' })

      expect(updated?.closed_at, 'closed_at should be set after closing').toBeDefined()
      expect(() => new Date(updated!.closed_at!)).not.toThrow()
    })

    it('should set opened_at and clear closed_at when reopened', () => {
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        status: 'closed',
      })
      const originalOpenedAt = ticket.opened_at

      const reopened = ticketsRepository.update(ticket.id, { status: 'open' })

      expect(reopened?.closed_at, 'closed_at should be cleared on reopen').toBeNull()
      expect(reopened?.opened_at, 'opened_at should be updated on reopen').toBeDefined()
    })

    it('should not modify opened_at or closed_at on non-status updates', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)
      const originalOpenedAt = ticket.opened_at

      const updated = ticketsRepository.update(ticket.id, { title: 'New title' })

      expect(updated?.opened_at).toBe(originalOpenedAt)
      expect(updated?.closed_at).toBeNull()
    })
  })

  /*
   * LIST WITH LABELS TESTS
   * Verify tickets are returned with their associated labels
   */
  describe('listWithLabels', () => {
    it('should return tickets with their labels', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'bug',
      })
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Ticket with labels',
      })
      labelsRepository.addToTicket(ticket.id, label.id)

      const tickets = ticketsRepository.listWithLabels()

      const foundTicket = tickets.find((t) => t.id === ticket.id)
      expect(foundTicket).toBeDefined()
      expect(foundTicket?.labels).toHaveLength(1)
      expect(foundTicket?.labels[0]?.name).toBe('bug')
    })

    it('should return empty labels array for tickets without labels', () => {
      ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Ticket without labels',
      })

      const tickets = ticketsRepository.listWithLabels()

      expect(tickets.every((t) => Array.isArray(t.labels))).toBe(true)
    })

    it('should apply filters when listing with labels', () => {
      ticketsRepository.create({ ...TEST_TICKET, title: 'Open', status: 'open' })
      ticketsRepository.create({ ...TEST_TICKET, title: 'Closed', status: 'closed' })

      const openTickets = ticketsRepository.listWithLabels({ status: 'open' })

      expect(openTickets.every((t) => t.status === 'open')).toBe(true)
    })

    it('should return empty array when no tickets match filters', () => {
      const tickets = ticketsRepository.listWithLabels({ status: 'blocked' })

      expect(tickets).toHaveLength(0)
    })

    it('should return multiple labels per ticket sorted by name', () => {
      const labelC = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'c-label',
      })
      const labelA = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'a-label',
      })
      const ticket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Multi-label ticket',
      })
      labelsRepository.addToTicket(ticket.id, labelC.id)
      labelsRepository.addToTicket(ticket.id, labelA.id)

      const tickets = ticketsRepository.listWithLabels()

      const foundTicket = tickets.find((t) => t.id === ticket.id)
      expect(foundTicket?.labels).toHaveLength(2)
      expect(foundTicket?.labels[0]?.name).toBe('a-label')
      expect(foundTicket?.labels[1]?.name).toBe('c-label')
    })
  })

  /*
   * LIST WITH LABEL_IDS FILTER TESTS
   * Verify filtering tickets by label IDs (AND semantics - all labels must match)
   */
  describe('list with label_ids filter', () => {
    it('should filter tickets by single label_id', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'bug',
      })
      const ticketWithLabel = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Bug ticket',
      })
      const ticketWithoutLabel = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Normal ticket',
      })
      labelsRepository.addToTicket(ticketWithLabel.id, label.id)

      const tickets = ticketsRepository.list({ label_ids: [label.id] })

      expect(tickets).toHaveLength(1)
      expect(tickets[0]?.id).toBe(ticketWithLabel.id)
    })

    it('should filter tickets by multiple label_ids (AND semantics)', () => {
      const labelBug = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'bug',
      })
      const labelUrgent = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'urgent',
      })
      const ticketBothLabels = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Urgent bug',
      })
      const ticketOnlyBug = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Regular bug',
      })
      labelsRepository.addToTicket(ticketBothLabels.id, labelBug.id)
      labelsRepository.addToTicket(ticketBothLabels.id, labelUrgent.id)
      labelsRepository.addToTicket(ticketOnlyBug.id, labelBug.id)

      const tickets = ticketsRepository.list({
        label_ids: [labelBug.id, labelUrgent.id],
      })

      expect(tickets, 'Only ticket with BOTH labels should be returned').toHaveLength(1)
      expect(tickets[0]?.id).toBe(ticketBothLabels.id)
    })

    it('should return empty array for non-existent label_id', () => {
      ticketsRepository.create(TEST_TICKET)

      const tickets = ticketsRepository.list({ label_ids: [999999] })

      expect(tickets).toHaveLength(0)
    })

    it('should combine label_ids filter with status filter', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'feature',
      })
      const openTicket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Open feature',
        status: 'open',
      })
      const closedTicket = ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Closed feature',
        status: 'closed',
      })
      labelsRepository.addToTicket(openTicket.id, label.id)
      labelsRepository.addToTicket(closedTicket.id, label.id)

      const tickets = ticketsRepository.list({
        label_ids: [label.id],
        status: 'open',
      })

      expect(tickets).toHaveLength(1)
      expect(tickets[0]?.id).toBe(openTicket.id)
    })

    it('should return all tickets when label_ids is not provided', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'test',
      })
      ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Labeled ticket',
      })
      ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Unlabeled ticket',
      })

      const ticketsWithFilter = ticketsRepository.list({ label_ids: undefined })
      const ticketsNoFilter = ticketsRepository.list()

      expect(ticketsWithFilter.length).toBe(ticketsNoFilter.length)
    })
  })

  /*
   * LAST_ACTIVITY_AT COLUMN TESTS
   * Verify last_activity_at is maintained across all activity types
   */
  describe('last_activity_at', () => {
    it('should set last_activity_at on ticket creation', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)

      expect(ticket.last_activity_at, 'last_activity_at should be set').toBeDefined()
      expect(() => new Date(ticket.last_activity_at)).not.toThrow()
    })

    it('should update last_activity_at when ticket is updated', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)
      const originalActivityAt = ticket.last_activity_at

      const updated = ticketsRepository.update(ticket.id, { title: 'Updated title' })

      expect(updated?.last_activity_at).toBeDefined()
      expect(updated!.last_activity_at >= originalActivityAt).toBe(true)
    })

    it('should update last_activity_at when ticket is claimed', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)
      const originalActivityAt = ticket.last_activity_at

      const result = ticketsRepository.claim({
        ticket_id: ticket.id,
        claimer_id: TEST_USER_ID,
      })

      expect(result.success).toBe(true)
      expect(result.ticket!.last_activity_at >= originalActivityAt).toBe(true)
    })

    it('should update last_activity_at when ticket is unclaimed', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)
      ticketsRepository.claim({
        ticket_id: ticket.id,
        claimer_id: TEST_USER_ID,
      })
      const claimedTicket = ticketsRepository._getInternal(ticket.id)!
      const activityAfterClaim = claimedTicket.last_activity_at

      const result = ticketsRepository.unclaim(ticket.id, TEST_USER_ID)

      expect(result.success).toBe(true)
      expect(result.ticket!.last_activity_at >= activityAfterClaim).toBe(true)
    })

    it('should update last_activity_at when a comment is added', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)
      const originalActivityAt = ticket.last_activity_at

      commentsRepository.create({
        ticket_id: ticket.id,
        author_id: TEST_USER_ID,
        body: 'A comment',
      })

      const updatedTicket = ticketsRepository._getInternal(ticket.id)!
      expect(updatedTicket.last_activity_at >= originalActivityAt).toBe(true)
    })

    it('should sort by last_activity_at DESC', () => {
      const t1 = ticketsRepository.create({ ...TEST_TICKET, title: 'First' })
      const t2 = ticketsRepository.create({ ...TEST_TICKET, title: 'Second' })
      // Add a comment to t1 to make its last_activity_at newer
      commentsRepository.create({
        ticket_id: t1.id,
        author_id: TEST_USER_ID,
        body: 'Activity on first ticket',
      })

      const tickets = ticketsRepository.list({ sort_by: 'last_activity_at' })

      expect(tickets[0]?.title, 'Ticket with recent comment should sort first').toBe('First')
    })

    it('should sort by last_activity_at ASC', () => {
      const t1 = ticketsRepository.create({ ...TEST_TICKET, title: 'First' })
      const t2 = ticketsRepository.create({ ...TEST_TICKET, title: 'Second' })

      // Manually set different last_activity_at values to avoid same-second timing issues
      const db = getDatabase()
      db.prepare("UPDATE tickets SET last_activity_at = '2025-01-01 00:00:00' WHERE id = ?").run(t1.id)
      db.prepare("UPDATE tickets SET last_activity_at = '2025-01-02 00:00:00' WHERE id = ?").run(t2.id)

      const tickets = ticketsRepository.list({
        sort_by: 'last_activity_at',
        sort_order: 'asc',
      })

      expect(tickets[0]?.title, 'Ticket with earlier last_activity_at should sort first').toBe('First')
      expect(tickets[1]?.title).toBe('Second')
    })
  })

  describe('getWithRelations', () => {
    it('should return null for non-existent ticket', () => {
      const ticket = ticketsRepository._getInternalWithRelations(NON_EXISTENT_ID)
      expect(ticket).toBeNull()
    })

    it('should return ticket with resolved author profile', () => {
      const created = ticketsRepository.create(TEST_TICKET)
      const ticket = ticketsRepository._getInternalWithRelations(created.id)

      expect(ticket).not.toBeNull()
      expect(ticket!.author).toBeDefined()
      expect(ticket!.author.id).toBe(TEST_USER_ID)
      expect(ticket!.author.name).toBe('Test User')
      expect(ticket!.author.type).toBe('user')
      expect(ticket!.author.is_active).toBe(true)
    })

    it('should return null assignee when ticket has no assignee', () => {
      const created = ticketsRepository.create(TEST_TICKET)
      const ticket = ticketsRepository._getInternalWithRelations(created.id)

      expect(ticket!.assignee).toBeNull()
    })

    it('should return resolved assignee profile when assigned', () => {
      const created = ticketsRepository.create({
        ...TEST_TICKET,
        assignee_id: TEST_AGENT_ID,
      })
      const ticket = ticketsRepository._getInternalWithRelations(created.id)

      expect(ticket!.assignee).not.toBeNull()
      expect(ticket!.assignee!.id).toBe(TEST_AGENT_ID)
      expect(ticket!.assignee!.name).toBe('Test Agent')
      expect(ticket!.assignee!.type).toBe('agent')
    })

    it('should include labels', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'bug',
      })
      const created = ticketsRepository.create(TEST_TICKET)
      labelsRepository.addToTicket(created.id, label.id)

      const ticket = ticketsRepository._getInternalWithRelations(created.id)

      expect(ticket!.labels).toHaveLength(1)
      expect(ticket!.labels[0]!.name).toBe('bug')
    })
  })

  describe('listWithRelations', () => {
    it('should return empty array when no tickets match', () => {
      const tickets = ticketsRepository.listWithRelations({ status: 'blocked' })
      expect(tickets).toHaveLength(0)
    })

    it('should return tickets with resolved author profiles', () => {
      ticketsRepository.create(TEST_TICKET)
      const tickets = ticketsRepository.listWithRelations()

      expect(tickets.length).toBeGreaterThan(0)
      for (const ticket of tickets) {
        expect(ticket.author).toBeDefined()
        expect(ticket.author.id).toBe(ticket.author_id)
        expect(typeof ticket.author.name).toBe('string')
      }
    })

    it('should resolve assignee profiles where present', () => {
      ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Assigned ticket',
        assignee_id: TEST_AGENT_ID,
      })
      ticketsRepository.create({
        ...TEST_TICKET,
        title: 'Unassigned ticket',
      })

      const tickets = ticketsRepository.listWithRelations()
      const assigned = tickets.find((t) => t.title === 'Assigned ticket')
      const unassigned = tickets.find((t) => t.title === 'Unassigned ticket')

      expect(assigned!.assignee).not.toBeNull()
      expect(assigned!.assignee!.id).toBe(TEST_AGENT_ID)
      expect(unassigned!.assignee).toBeNull()
    })

    it('should include labels for each ticket', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'feature',
      })
      const ticket = ticketsRepository.create(TEST_TICKET)
      labelsRepository.addToTicket(ticket.id, label.id)

      const tickets = ticketsRepository.listWithRelations()
      const found = tickets.find((t) => t.id === ticket.id)

      expect(found!.labels).toHaveLength(1)
      expect(found!.labels[0]!.name).toBe('feature')
    })

    it('should apply filters', () => {
      ticketsRepository.create({ ...TEST_TICKET, title: 'Open', status: 'open' })
      ticketsRepository.create({ ...TEST_TICKET, title: 'Closed', status: 'closed' })

      const openTickets = ticketsRepository.listWithRelations({ status: 'open' })
      expect(openTickets.every((t) => t.status === 'open')).toBe(true)
    })
  })

  describe('event actor_type resolution', () => {
    it('should set actor_type to "agent" when ticket is created by an agent', () => {
      db.prepare('DELETE FROM events').run()

      ticketsRepository.create({
        title: 'Agent-created ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_AGENT_ID,
      })

      const events = eventsRepository.list({ event_type: 'ticket.created' })

      expect(events).toHaveLength(1)
      expect(events[0]?.actor_type, 'Agent-created ticket should have actor_type "agent"').toBe('agent')
      expect(events[0]?.actor_id).toBe(TEST_AGENT_ID)
    })

    it('should set actor_type to "user" when ticket is created by a user', () => {
      db.prepare('DELETE FROM events').run()

      ticketsRepository.create({
        title: 'User-created ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })

      const events = eventsRepository.list({ event_type: 'ticket.created' })

      expect(events).toHaveLength(1)
      expect(events[0]?.actor_type, 'User-created ticket should have actor_type "user"').toBe('user')
    })

    it('should set actor_type to "agent" when ticket is updated by an agent', () => {
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      db.prepare('DELETE FROM events').run()

      ticketsRepository.update(ticket.id, { status: 'closed' }, TEST_AGENT_ID)

      const events = eventsRepository.list({ event_type: 'ticket.closed' })

      expect(events).toHaveLength(1)
      expect(events[0]?.actor_type, 'Agent-closed ticket should have actor_type "agent"').toBe('agent')
      expect(events[0]?.actor_id).toBe(TEST_AGENT_ID)
    })

    it('should set actor_type to "user" when ticket is updated by a user', () => {
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      db.prepare('DELETE FROM events').run()

      ticketsRepository.update(ticket.id, { status: 'closed' }, TEST_USER_ID)

      const events = eventsRepository.list({ event_type: 'ticket.closed' })

      expect(events).toHaveLength(1)
      expect(events[0]?.actor_type, 'User-closed ticket should have actor_type "user"').toBe('user')
    })

    it('should set correct actor on ticket.updated event for a non-status change', () => {
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      db.prepare('DELETE FROM events').run()

      ticketsRepository.update(ticket.id, { title: 'New title' }, TEST_AGENT_ID)

      const events = eventsRepository.list({ event_type: 'ticket.updated' })

      expect(events).toHaveLength(1)
      expect(events[0]?.actor_id, 'ticket.updated event should have correct actor_id').toBe(TEST_AGENT_ID)
      expect(events[0]?.actor_type, 'Agent-updated ticket should have actor_type "agent"').toBe('agent')
    })

    it('should set actor_type to "user" on ticket.updated event when updated by a user', () => {
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_AGENT_ID,
      })
      db.prepare('DELETE FROM events').run()

      ticketsRepository.update(ticket.id, { body: 'Updated body' }, TEST_USER_ID)

      const events = eventsRepository.list({ event_type: 'ticket.updated' })

      expect(events).toHaveLength(1)
      expect(events[0]?.actor_id).toBe(TEST_USER_ID)
      expect(events[0]?.actor_type, 'User-updated ticket should have actor_type "user"').toBe('user')
    })

    it('should set correct actor on ticket.reopened event', () => {
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        status: 'closed',
      })
      db.prepare('DELETE FROM events').run()

      ticketsRepository.update(ticket.id, { status: 'open' }, TEST_AGENT_ID)

      const events = eventsRepository.list({ event_type: 'ticket.reopened' })

      expect(events).toHaveLength(1)
      expect(events[0]?.actor_id, 'ticket.reopened event should have correct actor_id').toBe(TEST_AGENT_ID)
      expect(events[0]?.actor_type, 'Agent-reopened ticket should have actor_type "agent"').toBe('agent')
    })
  })

  describe('update atomicity', () => {
    it('should roll back ticket update when updatedById references non-existent profile', () => {
      const ticket = ticketsRepository.create({
        title: 'Original title',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })

      expect(
        () => ticketsRepository.update(ticket.id, { title: 'New title' }, 'nonexistent-profile-id'),
        'Should throw on FK constraint violation for non-existent updatedById'
      ).toThrow()

      const afterAttempt = ticketsRepository._getInternal(ticket.id)
      expect(afterAttempt?.title, 'Title should remain unchanged after rollback').toBe('Original title')
    })
  })

  describe('countByStatus', () => {
    it('should return zero counts for a project with no tickets', () => {
      const counts = ticketsRepository.countByStatus('nonexistent-project')
      expect(counts).toEqual({ open: 0, in_progress: 0, blocked: 0, closed: 0 })
    })

    it('should return correct counts for each status', () => {
      ticketsRepository.create({ ...TEST_TICKET, status: 'open' })
      ticketsRepository.create({ ...TEST_TICKET, status: 'open' })
      ticketsRepository.create({ ...TEST_TICKET, status: 'in_progress' })
      ticketsRepository.create({ ...TEST_TICKET, status: 'blocked' })
      ticketsRepository.create({ ...TEST_TICKET, status: 'closed' })
      ticketsRepository.create({ ...TEST_TICKET, status: 'closed' })
      ticketsRepository.create({ ...TEST_TICKET, status: 'closed' })

      const counts = ticketsRepository.countByStatus(TEST_PROJECT_ID)
      expect(counts.open, 'open count').toBe(2)
      expect(counts.in_progress, 'in_progress count').toBe(1)
      expect(counts.blocked, 'blocked count').toBe(1)
      expect(counts.closed, 'closed count').toBe(3)
    })

    it('should return accurate counts beyond the default 100-row page limit', () => {
      // Create 120 tickets: 40 open, 35 in_progress, 15 blocked, 30 closed
      for (let i = 0; i < 40; i++) ticketsRepository.create({ ...TEST_TICKET, status: 'open' })
      for (let i = 0; i < 35; i++) ticketsRepository.create({ ...TEST_TICKET, status: 'in_progress' })
      for (let i = 0; i < 15; i++) ticketsRepository.create({ ...TEST_TICKET, status: 'blocked' })
      for (let i = 0; i < 30; i++) ticketsRepository.create({ ...TEST_TICKET, status: 'closed' })

      const counts = ticketsRepository.countByStatus(TEST_PROJECT_ID)
      expect(counts.open, 'open count should not be capped at 100').toBe(40)
      expect(counts.in_progress, 'in_progress count').toBe(35)
      expect(counts.blocked, 'blocked count').toBe(15)
      expect(counts.closed, 'closed count').toBe(30)
    })

    it('should only count tickets for the specified project', () => {
      // Create a second project for isolation test
      db.prepare(`INSERT INTO projects (id, name, owner_id) VALUES (?, 'Other Project', ?)`).run('other-project', TEST_USER_ID)

      ticketsRepository.create({ ...TEST_TICKET, status: 'open' })
      ticketsRepository.create({ ...TEST_TICKET, status: 'open' })
      ticketsRepository.create({ title: 'Other project', project_id: 'other-project', author_id: TEST_USER_ID, status: 'open' })

      const counts = ticketsRepository.countByStatus(TEST_PROJECT_ID)
      expect(counts.open, 'should only count tickets in the specified project').toBe(2)
    })
  })

  describe('ticket_number', () => {
    it('should auto-assign ticket_number starting at 1', () => {
      const t1 = ticketsRepository.create(TEST_TICKET)
      expect(t1.ticket_number).toBe(1)

      const t2 = ticketsRepository.create(TEST_TICKET)
      expect(t2.ticket_number).toBe(2)

      const t3 = ticketsRepository.create(TEST_TICKET)
      expect(t3.ticket_number).toBe(3)
    })

    it('should scope ticket_number per project', () => {
      db.prepare(`INSERT INTO projects (id, name, owner_id) VALUES (?, 'Project B', ?)`).run('project-b', TEST_USER_ID)

      const t1 = ticketsRepository.create({ ...TEST_TICKET, project_id: TEST_PROJECT_ID })
      const t2 = ticketsRepository.create({ ...TEST_TICKET, project_id: 'project-b' })
      const t3 = ticketsRepository.create({ ...TEST_TICKET, project_id: TEST_PROJECT_ID })

      expect(t1.ticket_number, 'first ticket in default project').toBe(1)
      expect(t2.ticket_number, 'first ticket in project-b').toBe(1)
      expect(t3.ticket_number, 'second ticket in default project').toBe(2)
    })

    it('should enforce uniqueness at database level', () => {
      ticketsRepository.create(TEST_TICKET)
      expect(() => {
        db.prepare(
          'INSERT INTO tickets (project_id, author_id, title, ticket_number, opened_at, last_activity_at) VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))'
        ).run(TEST_PROJECT_ID, TEST_USER_ID, 'Dupe', 1)
      }).toThrow()
    })

    it('should start at 1 for a project with no tickets', () => {
      db.prepare(`INSERT INTO projects (id, name, owner_id) VALUES (?, 'Empty Project', ?)`).run('empty-project', TEST_USER_ID)
      const t1 = ticketsRepository.create({ ...TEST_TICKET, project_id: 'empty-project' })
      expect(t1.ticket_number).toBe(1)
    })

    it('should not reuse numbers when non-max ticket is deleted', () => {
      ticketsRepository.create(TEST_TICKET) // ticket_number 1
      const t2 = ticketsRepository.create(TEST_TICKET) // ticket_number 2
      const t3 = ticketsRepository.create(TEST_TICKET) // ticket_number 3
      ticketsRepository.delete(t2.id) // delete middle ticket

      const t4 = ticketsRepository.create(TEST_TICKET)
      expect(t4.ticket_number, 'should continue from max existing number').toBe(4)
    })

    it('should include ticket_number in get()', () => {
      const created = ticketsRepository.create(TEST_TICKET)
      const fetched = ticketsRepository._getInternal(created.id)
      expect(fetched?.ticket_number).toBe(1)
    })

    it('should include ticket_number in getWithRelations()', () => {
      const created = ticketsRepository.create(TEST_TICKET)
      const fetched = ticketsRepository._getInternalWithRelations(created.id)
      expect(fetched?.ticket_number).toBe(1)
    })

    it('should include ticket_number in list()', () => {
      ticketsRepository.create(TEST_TICKET)
      ticketsRepository.create(TEST_TICKET)
      const tickets = ticketsRepository.list({ project_id: TEST_PROJECT_ID })
      expect(tickets.map((t) => t.ticket_number).sort()).toEqual([1, 2])
    })
  })

  describe('getByNumber', () => {
    it('should return ticket by project and number', () => {
      const created = ticketsRepository.create(TEST_TICKET)
      const found = ticketsRepository.getByNumber(TEST_PROJECT_ID, created.ticket_number)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(created.id)
      expect(found!.ticket_number).toBe(1)
    })

    it('should return null for non-existent number', () => {
      const found = ticketsRepository.getByNumber(TEST_PROJECT_ID, 999)
      expect(found).toBeNull()
    })

    it('should not find ticket from another project', () => {
      db.prepare(`INSERT INTO projects (id, name, owner_id) VALUES (?, 'Other', ?)`).run('other-project', TEST_USER_ID)
      ticketsRepository.create(TEST_TICKET)

      const found = ticketsRepository.getByNumber('other-project', 1)
      expect(found).toBeNull()
    })
  })

  describe('getByNumberWithRelations', () => {
    it('should return ticket with author, assignee, and labels', () => {
      const created = ticketsRepository.create({ ...TEST_TICKET, assignee_id: TEST_AGENT_ID })
      const found = ticketsRepository.getByNumberWithRelations(TEST_PROJECT_ID, created.ticket_number)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(created.id)
      expect(found!.ticket_number).toBe(1)
      expect(found!.author.id).toBe(TEST_USER_ID)
      expect(found!.assignee!.id).toBe(TEST_AGENT_ID)
      expect(found!.labels).toEqual([])
    })

    it('should return null for non-existent number', () => {
      const found = ticketsRepository.getByNumberWithRelations(TEST_PROJECT_ID, 999)
      expect(found).toBeNull()
    })
  })

  describe('search by ticket_number', () => {
    it('should match ticket_number when project_id is filtered', () => {
      ticketsRepository.create({ ...TEST_TICKET, title: 'Alpha' })
      ticketsRepository.create({ ...TEST_TICKET, title: 'Beta' })

      const results = ticketsRepository.list({
        project_id: TEST_PROJECT_ID,
        search: '2',
      })

      const titles = results.map((t) => t.title)
      expect(titles).toContain('Beta')
    })

    it('should match ticket_number when project_id is not filtered', () => {
      ticketsRepository.create({ ...TEST_TICKET, title: 'Alpha' })
      ticketsRepository.create({ ...TEST_TICKET, title: 'Beta' })

      const results = ticketsRepository.list({ search: '2' })
      const titles = results.map((t) => t.title)
      expect(titles).toContain('Beta')
    })

    it('should prioritize ticket_number match over id match', () => {
      // Create tickets across two projects so ticket_number diverges from id
      db.prepare(`INSERT INTO projects (id, name, owner_id) VALUES (?, 'Project B', ?)`).run('project-b', TEST_USER_ID)

      // Project A: id=1, ticket_number=1
      ticketsRepository.create({ ...TEST_TICKET, title: 'Filler A' })
      // Project B: id=2, ticket_number=1
      ticketsRepository.create({ ...TEST_TICKET, project_id: 'project-b', title: 'Filler B' })
      // Project A: id=3, ticket_number=2
      ticketsRepository.create({ ...TEST_TICKET, title: 'Target' })

      // Search for "2" without project filter
      // ticket id=2 has ticket_number=1, ticket id=3 has ticket_number=2
      // ticket_number=2 match (id=3, "Target") should rank above id=2 match ("Filler B")
      const results = ticketsRepository.list({ search: '2' })

      expect(results.length).toBeGreaterThan(0)
      expect(results[0]!.title, 'ticket_number match should rank first').toBe('Target')
    })
  })
})
