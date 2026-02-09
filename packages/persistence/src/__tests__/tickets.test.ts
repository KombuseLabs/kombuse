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
import { setupTestDb, TEST_USER_ID, TEST_PROJECT_ID } from '../test-utils'
import { getDatabase } from '../database'
import { ticketsRepository } from '../tickets'
import { labelsRepository } from '../labels'
import { commentsRepository } from '../comments'

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
  })

  /*
   * GET TESTS
   * Verify single ticket retrieval
   */
  describe('get', () => {
    it('should return null for non-existent ticket ID', () => {
      const ticket = ticketsRepository.get(NON_EXISTENT_ID)

      expect(ticket, `ID ${NON_EXISTENT_ID} should not exist`).toBeNull()
    })

    it('should return ticket by ID', () => {
      const created = ticketsRepository.create(TEST_TICKET)

      const ticket = ticketsRepository.get(created.id)

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
        ticketsRepository.get(ticket.id),
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
      const claimedTicket = ticketsRepository.get(ticket.id)!
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

      const updatedTicket = ticketsRepository.get(ticket.id)!
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
})
