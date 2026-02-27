import type {
  Event,
  EventSubscription,
  EventSubscriptionInput,
  UnprocessedEventsResult,
} from '@kombuse/types'
import { getDatabase } from './database'

/**
 * Data access layer for event subscriptions (agent event tracking)
 */
export const eventSubscriptionsRepository = {
  /**
   * List all subscriptions for a subscriber
   */
  list(subscriberId: string): EventSubscription[] {
    const db = getDatabase()
    return db
      .prepare('SELECT * FROM event_subscriptions WHERE subscriber_id = ? ORDER BY created_at DESC')
      .all(subscriberId) as EventSubscription[]
  },

  /**
   * Get a single subscription by ID
   */
  get(id: number): EventSubscription | null {
    const db = getDatabase()
    const subscription = db
      .prepare('SELECT * FROM event_subscriptions WHERE id = ?')
      .get(id) as EventSubscription | undefined
    return subscription ?? null
  },

  /**
   * Get a subscription by filter (subscriber, event_type, project)
   */
  getByFilter(
    subscriberId: string,
    eventType: string,
    projectId?: string
  ): EventSubscription | null {
    const db = getDatabase()
    const subscription = db
      .prepare(
        `
        SELECT * FROM event_subscriptions
        WHERE subscriber_id = ?
          AND event_type = ?
          AND (project_id = ? OR (? IS NULL AND project_id IS NULL))
      `
      )
      .get(subscriberId, eventType, projectId ?? null, projectId ?? null) as
      | EventSubscription
      | undefined
    return subscription ?? null
  },

  /**
   * Create or update a subscription (upsert)
   */
  create(input: EventSubscriptionInput): EventSubscription {
    const db = getDatabase()

    // Check if subscription already exists
    const existing = this.getByFilter(
      input.subscriber_id,
      input.event_type,
      input.project_id
    )

    if (existing) {
      // Return existing subscription
      return existing
    }

    return db
      .prepare(
        `
      INSERT INTO event_subscriptions (subscriber_id, event_type, project_id)
      VALUES (?, ?, ?)
      RETURNING *
    `
      )
      .get(input.subscriber_id, input.event_type, input.project_id ?? null) as EventSubscription
  },

  /**
   * Get unprocessed events for a subscriber across all their subscriptions
   */
  getUnprocessedEvents(subscriberId: string): UnprocessedEventsResult[] {
    const db = getDatabase()
    const subscriptions = this.list(subscriberId)
    const results: UnprocessedEventsResult[] = []

    for (const subscription of subscriptions) {
      const events = db
        .prepare(
          `
          SELECT e.*
          FROM events e
          WHERE e.event_type = ?
            AND (? IS NULL OR e.project_id = ?)
            AND (? IS NULL OR e.id > ?)
          ORDER BY e.id ASC
        `
        )
        .all(
          subscription.event_type,
          subscription.project_id,
          subscription.project_id,
          subscription.last_processed_event_id,
          subscription.last_processed_event_id
        ) as Event[]

      if (events.length > 0) {
        results.push({ events, subscription })
      }
    }

    return results
  },

  /**
   * Get unprocessed events for a specific subscription
   */
  getUnprocessedEventsForSubscription(subscriptionId: number): Event[] {
    const db = getDatabase()
    const subscription = this.get(subscriptionId)
    if (!subscription) return []

    return db
      .prepare(
        `
        SELECT e.*
        FROM events e
        WHERE e.event_type = ?
          AND (? IS NULL OR e.project_id = ?)
          AND (? IS NULL OR e.id > ?)
        ORDER BY e.id ASC
      `
      )
      .all(
        subscription.event_type,
        subscription.project_id,
        subscription.project_id,
        subscription.last_processed_event_id,
        subscription.last_processed_event_id
      ) as Event[]
  },

  /**
   * Update the last processed event ID for a subscription
   */
  updateLastProcessed(subscriptionId: number, lastEventId: number): boolean {
    const db = getDatabase()
    const result = db
      .prepare(
        'UPDATE event_subscriptions SET last_processed_event_id = ? WHERE id = ?'
      )
      .run(lastEventId, subscriptionId)
    return result.changes > 0
  },

  /**
   * Delete a subscription
   */
  delete(id: number): boolean {
    const db = getDatabase()
    const result = db
      .prepare('DELETE FROM event_subscriptions WHERE id = ?')
      .run(id)
    return result.changes > 0
  },
}
