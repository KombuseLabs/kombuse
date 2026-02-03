/**
 * @fileoverview Tests for events repository operations
 *
 * Run all: bun run --filter @kombuse/persistence test -- src/__tests__/events.test.ts
 * Run one: bun run --filter @kombuse/persistence test -- -t "should create an event"
 *
 * Tests cover:
 * - create: Insert new events with payload
 * - get: Retrieve single event by ID
 * - list: Query events with filters
 * - getByTicket: Get all events for a ticket
 * - getLatestId: Get the highest event ID
 * - getAfter: Get events after a specific ID (for polling)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { setupTestDb, TEST_USER_ID, TEST_AGENT_ID, TEST_PROJECT_ID } from '../test-utils'
import { eventsRepository } from '../events'
import { ticketsRepository } from '../tickets'

const NON_EXISTENT_ID = 999999

describe('eventsRepository', () => {
  let cleanup: () => void
  let db: DatabaseType
  let testTicketId: number

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    db = setup.db

    // Create a test ticket for event references
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
    it('should create an event with all fields', () => {
      const event = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: { ticket_id: testTicketId, title: 'Test Ticket' },
      })

      expect(event.id, 'Event should have auto-generated ID').toBeDefined()
      expect(event.event_type).toBe('ticket.created')
      expect(event.project_id).toBe(TEST_PROJECT_ID)
      expect(event.ticket_id).toBe(testTicketId)
      expect(event.actor_id).toBe(TEST_USER_ID)
      expect(event.actor_type).toBe('user')
    })

    it('should serialize payload to JSON string', () => {
      const payload = { key: 'value', nested: { foo: 'bar' } }
      const event = eventsRepository.create({
        event_type: 'test.event',
        actor_type: 'system',
        payload,
      })

      expect(event.payload).toBe(JSON.stringify(payload))
      expect(JSON.parse(event.payload)).toEqual(payload)
    })

    it('should create event with minimal fields', () => {
      const event = eventsRepository.create({
        event_type: 'system.startup',
        actor_type: 'system',
        payload: {},
      })

      expect(event.event_type).toBe('system.startup')
      expect(event.project_id).toBeNull()
      expect(event.ticket_id).toBeNull()
      expect(event.comment_id).toBeNull()
      expect(event.actor_id).toBeNull()
    })

    it('should auto-generate timestamp on creation', () => {
      const event = eventsRepository.create({
        event_type: 'test.event',
        actor_type: 'system',
        payload: {},
      })

      expect(event.created_at).toBeDefined()
      expect(() => new Date(event.created_at)).not.toThrow()
    })
  })

  /*
   * GET TESTS
   */
  describe('get', () => {
    it('should return null for non-existent event ID', () => {
      const event = eventsRepository.get(NON_EXISTENT_ID)

      expect(event).toBeNull()
    })

    it('should return event by ID', () => {
      const created = eventsRepository.create({
        event_type: 'ticket.updated',
        ticket_id: testTicketId,
        actor_type: 'user',
        actor_id: TEST_USER_ID,
        payload: { changes: { status: ['open', 'closed'] } },
      })

      const event = eventsRepository.get(created.id)

      expect(event).not.toBeNull()
      expect(event?.id).toBe(created.id)
      expect(event?.event_type).toBe('ticket.updated')
    })
  })

  /*
   * LIST TESTS
   */
  describe('list', () => {
    beforeEach(() => {
      // Seed events for list tests
      eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_type: 'user',
        actor_id: TEST_USER_ID,
        payload: {},
      })
      eventsRepository.create({
        event_type: 'ticket.updated',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_type: 'agent',
        actor_id: TEST_AGENT_ID,
        payload: {},
      })
      eventsRepository.create({
        event_type: 'comment.added',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_type: 'user',
        actor_id: TEST_USER_ID,
        payload: {},
      })
    })

    it('should return all events when no filters provided', () => {
      const events = eventsRepository.list()

      expect(events).toHaveLength(3)
    })

    it('should filter events by event_type', () => {
      const events = eventsRepository.list({ event_type: 'ticket.created' })

      expect(events).toHaveLength(1)
      expect(events[0]?.event_type).toBe('ticket.created')
    })

    it('should filter events by project_id', () => {
      const events = eventsRepository.list({ project_id: TEST_PROJECT_ID })

      expect(events.length).toBeGreaterThanOrEqual(3)
      expect(events.every((e) => e.project_id === TEST_PROJECT_ID)).toBe(true)
    })

    it('should filter events by ticket_id', () => {
      const events = eventsRepository.list({ ticket_id: testTicketId })

      expect(events).toHaveLength(3)
      expect(events.every((e) => e.ticket_id === testTicketId)).toBe(true)
    })

    it('should filter events by actor_id', () => {
      const events = eventsRepository.list({ actor_id: TEST_USER_ID })

      expect(events).toHaveLength(2)
      expect(events.every((e) => e.actor_id === TEST_USER_ID)).toBe(true)
    })

    it('should filter events by actor_type', () => {
      const events = eventsRepository.list({ actor_type: 'agent' })

      expect(events).toHaveLength(1)
      expect(events[0]?.actor_type).toBe('agent')
    })

    it('should limit number of returned events', () => {
      const events = eventsRepository.list({ limit: 2 })

      expect(events).toHaveLength(2)
    })

    it('should support pagination with offset', () => {
      const page1 = eventsRepository.list({ limit: 2, offset: 0 })
      const page2 = eventsRepository.list({ limit: 2, offset: 2 })

      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(1)
      // Verify no overlap
      const page1Ids = page1.map((e) => e.id)
      const page2Ids = page2.map((e) => e.id)
      expect(page1Ids.filter((id) => page2Ids.includes(id))).toHaveLength(0)
    })
  })

  /*
   * GET BY TICKET TESTS
   */
  describe('getByTicket', () => {
    it('should return all events for a ticket', () => {
      eventsRepository.create({
        event_type: 'ticket.created',
        ticket_id: testTicketId,
        actor_type: 'user',
        payload: {},
      })
      eventsRepository.create({
        event_type: 'ticket.updated',
        ticket_id: testTicketId,
        actor_type: 'user',
        payload: {},
      })

      const events = eventsRepository.getByTicket(testTicketId)

      expect(events).toHaveLength(2)
      expect(events.every((e) => e.ticket_id === testTicketId)).toBe(true)
    })

    it('should return empty array for ticket with no events', () => {
      const newTicket = ticketsRepository.create({
        title: 'No Events Ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })

      const events = eventsRepository.getByTicket(newTicket.id)

      expect(events).toHaveLength(0)
    })
  })

  /*
   * GET LATEST ID TESTS
   */
  describe('getLatestId', () => {
    it('should return null when no events exist', () => {
      // Clear all events
      db.prepare('DELETE FROM events').run()

      const latestId = eventsRepository.getLatestId()

      expect(latestId).toBeNull()
    })

    it('should return the highest event ID', () => {
      const event1 = eventsRepository.create({
        event_type: 'test.event1',
        actor_type: 'system',
        payload: {},
      })
      const event2 = eventsRepository.create({
        event_type: 'test.event2',
        actor_type: 'system',
        payload: {},
      })

      const latestId = eventsRepository.getLatestId()

      expect(latestId).toBe(event2.id)
      expect(latestId).toBeGreaterThan(event1.id)
    })
  })

  /*
   * GET AFTER TESTS
   */
  describe('getAfter', () => {
    it('should return events after a specific ID', () => {
      const event1 = eventsRepository.create({
        event_type: 'test.event1',
        actor_type: 'system',
        payload: {},
      })
      const event2 = eventsRepository.create({
        event_type: 'test.event2',
        actor_type: 'system',
        payload: {},
      })
      const event3 = eventsRepository.create({
        event_type: 'test.event3',
        actor_type: 'system',
        payload: {},
      })

      const events = eventsRepository.getAfter(event1.id)

      expect(events).toHaveLength(2)
      expect(events.map((e) => e.id)).toContain(event2.id)
      expect(events.map((e) => e.id)).toContain(event3.id)
    })

    it('should return empty array when no events after ID', () => {
      const event = eventsRepository.create({
        event_type: 'test.event',
        actor_type: 'system',
        payload: {},
      })

      const events = eventsRepository.getAfter(event.id)

      expect(events).toHaveLength(0)
    })

    it('should respect limit parameter', () => {
      eventsRepository.create({
        event_type: 'test.event1',
        actor_type: 'system',
        payload: {},
      })
      eventsRepository.create({
        event_type: 'test.event2',
        actor_type: 'system',
        payload: {},
      })
      eventsRepository.create({
        event_type: 'test.event3',
        actor_type: 'system',
        payload: {},
      })

      const events = eventsRepository.getAfter(0, 2)

      expect(events).toHaveLength(2)
    })

    it('should return events in ascending order by ID', () => {
      eventsRepository.create({
        event_type: 'test.event1',
        actor_type: 'system',
        payload: {},
      })
      eventsRepository.create({
        event_type: 'test.event2',
        actor_type: 'system',
        payload: {},
      })
      eventsRepository.create({
        event_type: 'test.event3',
        actor_type: 'system',
        payload: {},
      })

      const events = eventsRepository.getAfter(0)

      for (let i = 1; i < events.length; i++) {
        expect(events[i]!.id).toBeGreaterThan(events[i - 1]!.id)
      }
    })
  })
})
