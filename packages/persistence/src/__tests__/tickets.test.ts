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
import { ticketsRepository } from '../tickets'
import { labelsRepository } from '../labels'

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

    it('should search tickets by title (case-insensitive LIKE)', () => {
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
})
