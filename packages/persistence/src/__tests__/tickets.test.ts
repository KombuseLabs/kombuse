/**
 * @fileoverview Tests for tickets repository CRUD operations
 *
 * Run all: bun run --filter @kombuse/persistence test -- src/__tests__/tickets.test.ts
 * Run one: bun run --filter @kombuse/persistence test -- -t "should create a ticket"
 *
 * Tests cover:
 * - create: Insert new tickets with required/optional fields
 * - get: Retrieve single ticket by ID with activities
 * - list: Query tickets with filters, search, pagination
 * - update: Modify existing tickets partially or fully
 * - delete: Remove tickets with cascade to activities
 * - addActivity: Append activity log entries to tickets
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDb } from '../test-utils'
import { ticketsRepository } from '../tickets'

// Test data constants - modify these to change test inputs
const TEST_TICKET = { title: 'Test ticket' }
const TEST_TICKET_FULL = {
  title: 'Full ticket',
  body: 'Detailed description',
  status: 'in_progress' as const,
  priority: 3,
  project_id: 'proj-123',
}
const NON_EXISTENT_ID = 999999

describe('ticketsRepository', () => {
  let cleanup: () => void

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
  })

  afterEach(() => {
    cleanup()
  })

  /*
   * CREATE TESTS
   * Verify ticket insertion with various input combinations
   */
  describe('create', () => {
    it('should create a ticket with only required fields (title)', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)

      expect(ticket.id, 'Ticket should have auto-generated ID').toBeDefined()
      expect(ticket.title).toBe(TEST_TICKET.title)
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
    })

    it('should auto-generate timestamps on creation', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)

      expect(ticket.created_at, 'created_at should be set').toBeDefined()
      expect(ticket.updated_at, 'updated_at should be set').toBeDefined()
      // Both should be valid ISO date strings
      expect(() => new Date(ticket.created_at)).not.toThrow()
      expect(() => new Date(ticket.updated_at)).not.toThrow()
    })
  })

  /*
   * GET TESTS
   * Verify single ticket retrieval with related data
   */
  describe('get', () => {
    it('should return null for non-existent ticket ID', () => {
      const ticket = ticketsRepository.get(NON_EXISTENT_ID)

      expect(ticket, `ID ${NON_EXISTENT_ID} should not exist`).toBeNull()
    })

    it('should return ticket with activities array populated', () => {
      const created = ticketsRepository.create(TEST_TICKET)
      ticketsRepository.addActivity(created.id, 'test_action', 'test details')

      const ticket = ticketsRepository.get(created.id)

      expect(ticket).not.toBeNull()
      expect(ticket?.activities, 'Should include activities array').toHaveLength(1)
      expect(ticket?.activities[0]?.action).toBe('test_action')
      expect(ticket?.activities[0]?.details).toBe('test details')
    })

    it('should return empty activities array when ticket has no activities', () => {
      const created = ticketsRepository.create(TEST_TICKET)

      const ticket = ticketsRepository.get(created.id)

      expect(ticket?.activities, 'Activities should be empty array, not undefined').toHaveLength(0)
    })
  })

  /*
   * LIST TESTS
   * Verify query functionality with various filters
   */
  describe('list', () => {
    // Seed data for list tests
    beforeEach(() => {
      ticketsRepository.create({ title: 'Open 1', status: 'open' })
      ticketsRepository.create({ title: 'Open 2', status: 'open' })
      ticketsRepository.create({ title: 'Closed', status: 'closed' })
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
      ticketsRepository.create({ title: 'High priority', priority: 4 })
      ticketsRepository.create({ title: 'Low priority', priority: 1 })

      const highPriority = ticketsRepository.list({ priority: 4 })

      expect(highPriority).toHaveLength(1)
      expect(highPriority[0]?.title).toBe('High priority')
    })

    it('should filter tickets by project_id', () => {
      ticketsRepository.create({ title: 'Project A', project_id: 'proj-a' })
      ticketsRepository.create({ title: 'Project B', project_id: 'proj-b' })

      const projectA = ticketsRepository.list({ project_id: 'proj-a' })

      expect(projectA).toHaveLength(1)
      expect(projectA[0]?.project_id).toBe('proj-a')
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
      const ticket = ticketsRepository.create({ title: 'Original', status: 'open' })

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
        title: 'Original',
        body: 'Original body',
        priority: 2,
      })

      const updated = ticketsRepository.update(ticket.id, { priority: 4 })

      expect(updated?.title, 'Title should remain unchanged').toBe('Original')
      expect(updated?.body, 'Body should remain unchanged').toBe('Original body')
      expect(updated?.priority, 'Only priority should change').toBe(4)
    })

    it('should return existing ticket when update has no fields', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)

      const result = ticketsRepository.update(ticket.id, {})

      expect(result?.id).toBe(ticket.id)
      expect(result?.title).toBe(ticket.title)
    })

    // Edge case: verify updated_at changes on update
    it('should update the updated_at timestamp', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)

      const updated = ticketsRepository.update(ticket.id, { title: 'Changed' })

      expect(updated?.title).toBe('Changed')
      // Note: timestamps may be equal if executed in same second
    })
  })

  /*
   * DELETE TESTS
   * Verify removal and cascade behavior
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

    // Edge case: verify CASCADE DELETE on activities
    it('should cascade delete all related activities', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)
      ticketsRepository.addActivity(ticket.id, 'action1', 'details1')
      ticketsRepository.addActivity(ticket.id, 'action2', 'details2')

      ticketsRepository.delete(ticket.id)

      // Ticket is gone, activities should be cascaded
      expect(ticketsRepository.get(ticket.id)).toBeNull()
    })
  })

  /*
   * ADD ACTIVITY TESTS
   * Verify activity log entries
   */
  describe('addActivity', () => {
    it('should add activity with action and details', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)

      const activity = ticketsRepository.addActivity(
        ticket.id,
        'comment',
        'This is a comment'
      )

      expect(activity.ticket_id).toBe(ticket.id)
      expect(activity.action).toBe('comment')
      expect(activity.details).toBe('This is a comment')
    })

    it('should add activity without details (details=null)', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)

      const activity = ticketsRepository.addActivity(ticket.id, 'viewed')

      expect(activity.action).toBe('viewed')
      expect(activity.details, 'Details should be null when not provided').toBeNull()
    })

    it('should auto-generate created_at timestamp', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)

      const activity = ticketsRepository.addActivity(ticket.id, 'action')

      expect(activity.created_at).toBeDefined()
      expect(() => new Date(activity.created_at)).not.toThrow()
    })

    it('should allow multiple activities on the same ticket', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)

      ticketsRepository.addActivity(ticket.id, 'created')
      ticketsRepository.addActivity(ticket.id, 'updated')
      ticketsRepository.addActivity(ticket.id, 'commented')

      const fullTicket = ticketsRepository.get(ticket.id)
      expect(fullTicket?.activities, 'Should have all 3 activities').toHaveLength(3)
    })
  })
})
