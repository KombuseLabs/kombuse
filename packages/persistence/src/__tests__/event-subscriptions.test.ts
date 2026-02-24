/**
 * @fileoverview Tests for event subscriptions repository operations
 *
 * Run all: bun run --filter @kombuse/persistence test -- src/__tests__/event-subscriptions.test.ts
 * Run one: bun run --filter @kombuse/persistence test -- -t "should create a subscription"
 *
 * Tests cover:
 * - create: Create new subscriptions (with upsert behavior)
 * - get: Retrieve single subscription by ID or filter
 * - list: Get all subscriptions for a subscriber
 * - getUnprocessedEvents: Get events not yet processed
 * - updateLastProcessed: Mark events as processed
 * - delete: Remove subscriptions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { setupTestDb, TEST_AGENT_ID, TEST_PROJECT_ID } from '../test-utils'
import { eventSubscriptionsRepository } from '../event-subscriptions.repository'
import { eventsRepository } from '../events.repository'

const NON_EXISTENT_ID = 999999

describe('eventSubscriptionsRepository', () => {
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
   */
  describe('create', () => {
    it('should create a subscription', () => {
      const subscription = eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
      })

      expect(subscription.id).toBeDefined()
      expect(subscription.subscriber_id).toBe(TEST_AGENT_ID)
      expect(subscription.event_type).toBe('ticket.created')
      expect(subscription.project_id).toBe(TEST_PROJECT_ID)
      expect(subscription.last_processed_event_id).toBeNull()
    })

    it('should create a subscription without project_id (global)', () => {
      const subscription = eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'mention.created',
      })

      expect(subscription.project_id).toBeNull()
      expect(subscription.event_type).toBe('mention.created')
    })

    it('should return existing subscription on duplicate (upsert)', () => {
      const first = eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
      })

      const second = eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
      })

      expect(second.id).toBe(first.id)
    })

    it('should auto-generate timestamp on creation', () => {
      const subscription = eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'ticket.created',
      })

      expect(subscription.created_at).toBeDefined()
      expect(() => new Date(subscription.created_at)).not.toThrow()
    })
  })

  /*
   * GET TESTS
   */
  describe('get', () => {
    it('should return null for non-existent subscription ID', () => {
      const subscription = eventSubscriptionsRepository.get(NON_EXISTENT_ID)

      expect(subscription).toBeNull()
    })

    it('should return subscription by ID', () => {
      const created = eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'ticket.created',
      })

      const subscription = eventSubscriptionsRepository.get(created.id)

      expect(subscription).not.toBeNull()
      expect(subscription?.id).toBe(created.id)
    })
  })

  describe('getByFilter', () => {
    it('should return subscription by filter', () => {
      eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
      })

      const subscription = eventSubscriptionsRepository.getByFilter(
        TEST_AGENT_ID,
        'ticket.created',
        TEST_PROJECT_ID
      )

      expect(subscription).not.toBeNull()
      expect(subscription?.subscriber_id).toBe(TEST_AGENT_ID)
    })

    it('should return null for non-matching filter', () => {
      eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
      })

      const subscription = eventSubscriptionsRepository.getByFilter(
        TEST_AGENT_ID,
        'ticket.updated',
        TEST_PROJECT_ID
      )

      expect(subscription).toBeNull()
    })

    it('should match global subscriptions (null project_id)', () => {
      eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'mention.created',
      })

      const subscription = eventSubscriptionsRepository.getByFilter(
        TEST_AGENT_ID,
        'mention.created'
      )

      expect(subscription).not.toBeNull()
      expect(subscription?.project_id).toBeNull()
    })
  })

  /*
   * LIST TESTS
   */
  describe('list', () => {
    it('should return all subscriptions for a subscriber', () => {
      eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'ticket.created',
      })
      eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'ticket.updated',
      })
      eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'comment.added',
      })

      const subscriptions = eventSubscriptionsRepository.list(TEST_AGENT_ID)

      expect(subscriptions).toHaveLength(3)
      expect(subscriptions.every((s) => s.subscriber_id === TEST_AGENT_ID)).toBe(true)
    })

    it('should return empty array for subscriber with no subscriptions', () => {
      const subscriptions = eventSubscriptionsRepository.list('unknown-agent')

      expect(subscriptions).toHaveLength(0)
    })
  })

  /*
   * GET UNPROCESSED EVENTS TESTS
   */
  describe('getUnprocessedEvents', () => {
    it('should return events not yet processed', () => {
      // Create subscription
      eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'ticket.created',
      })

      // Create some events
      eventsRepository.create({
        event_type: 'ticket.created',
        actor_type: 'user',
        payload: {},
      })
      eventsRepository.create({
        event_type: 'ticket.created',
        actor_type: 'user',
        payload: {},
      })

      const results = eventSubscriptionsRepository.getUnprocessedEvents(TEST_AGENT_ID)

      expect(results).toHaveLength(1)
      expect(results[0]?.events).toHaveLength(2)
      expect(results[0]?.subscription.event_type).toBe('ticket.created')
    })

    it('should not return events of different types', () => {
      // Subscribe only to ticket.created
      eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'ticket.created',
      })

      // Create different event types
      eventsRepository.create({
        event_type: 'ticket.created',
        actor_type: 'user',
        payload: {},
      })
      eventsRepository.create({
        event_type: 'ticket.updated',
        actor_type: 'user',
        payload: {},
      })

      const results = eventSubscriptionsRepository.getUnprocessedEvents(TEST_AGENT_ID)

      expect(results).toHaveLength(1)
      expect(results[0]?.events).toHaveLength(1)
      expect(results[0]?.events[0]?.event_type).toBe('ticket.created')
    })

    it('should exclude already processed events', () => {
      const subscription = eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'ticket.created',
      })

      const event1 = eventsRepository.create({
        event_type: 'ticket.created',
        actor_type: 'user',
        payload: {},
      })
      eventsRepository.create({
        event_type: 'ticket.created',
        actor_type: 'user',
        payload: {},
      })

      // Mark first event as processed
      eventSubscriptionsRepository.updateLastProcessed(subscription.id, event1.id)

      const results = eventSubscriptionsRepository.getUnprocessedEvents(TEST_AGENT_ID)

      expect(results).toHaveLength(1)
      expect(results[0]?.events).toHaveLength(1)
      expect(results[0]?.events[0]?.id).toBeGreaterThan(event1.id)
    })

    it('should filter by project_id when subscription is project-scoped', () => {
      eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
      })

      // Event in subscribed project
      eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        actor_type: 'user',
        payload: {},
      })
      // Event with no project (should not match project-scoped subscription)
      eventsRepository.create({
        event_type: 'ticket.created',
        actor_type: 'user',
        payload: {},
      })

      const results = eventSubscriptionsRepository.getUnprocessedEvents(TEST_AGENT_ID)

      expect(results).toHaveLength(1)
      expect(results[0]?.events).toHaveLength(1)
      expect(results[0]?.events[0]?.project_id).toBe(TEST_PROJECT_ID)
    })

    it('should return empty for subscriber with all events processed', () => {
      const subscription = eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'ticket.created',
      })

      const event = eventsRepository.create({
        event_type: 'ticket.created',
        actor_type: 'user',
        payload: {},
      })

      eventSubscriptionsRepository.updateLastProcessed(subscription.id, event.id)

      const results = eventSubscriptionsRepository.getUnprocessedEvents(TEST_AGENT_ID)

      expect(results).toHaveLength(0)
    })
  })

  /*
   * UPDATE LAST PROCESSED TESTS
   */
  describe('updateLastProcessed', () => {
    it('should update the last processed event ID', () => {
      const subscription = eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'ticket.created',
      })

      const event = eventsRepository.create({
        event_type: 'ticket.created',
        actor_type: 'user',
        payload: {},
      })

      const success = eventSubscriptionsRepository.updateLastProcessed(
        subscription.id,
        event.id
      )

      expect(success).toBe(true)

      const updated = eventSubscriptionsRepository.get(subscription.id)
      expect(updated?.last_processed_event_id).toBe(event.id)
    })

    it('should return false for non-existent subscription', () => {
      const success = eventSubscriptionsRepository.updateLastProcessed(
        NON_EXISTENT_ID,
        1
      )

      expect(success).toBe(false)
    })
  })

  /*
   * DELETE TESTS
   */
  describe('delete', () => {
    it('should delete existing subscription and return true', () => {
      const subscription = eventSubscriptionsRepository.create({
        subscriber_id: TEST_AGENT_ID,
        event_type: 'ticket.created',
      })

      const deleted = eventSubscriptionsRepository.delete(subscription.id)

      expect(deleted).toBe(true)
      expect(eventSubscriptionsRepository.get(subscription.id)).toBeNull()
    })

    it('should return false when deleting non-existent subscription', () => {
      const deleted = eventSubscriptionsRepository.delete(NON_EXISTENT_ID)

      expect(deleted).toBe(false)
    })
  })
})
