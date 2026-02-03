import type { Event, EventFilters, CreateEventInput } from '@kombuse/types'
import { getDatabase } from './database'

/**
 * Event listener type for WebSocket broadcasting
 */
type EventListener = (event: Event) => void
const listeners: EventListener[] = []

/**
 * Register a callback to be notified when events are created.
 * Used by the server to broadcast events via WebSocket.
 * Returns an unsubscribe function.
 */
export function onEventCreated(listener: EventListener): () => void {
  listeners.push(listener)
  return () => {
    const index = listeners.indexOf(listener)
    if (index > -1) listeners.splice(index, 1)
  }
}

/**
 * Data access layer for events (audit log)
 */
export const eventsRepository = {
  /**
   * List all events with optional filters
   */
  list(filters?: EventFilters): Event[] {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.event_type) {
      conditions.push('event_type = ?')
      params.push(filters.event_type)
    }
    if (filters?.project_id) {
      conditions.push('project_id = ?')
      params.push(filters.project_id)
    }
    if (filters?.ticket_id) {
      conditions.push('ticket_id = ?')
      params.push(filters.ticket_id)
    }
    if (filters?.actor_id) {
      conditions.push('actor_id = ?')
      params.push(filters.actor_id)
    }
    if (filters?.actor_type) {
      conditions.push('actor_type = ?')
      params.push(filters.actor_type)
    }
    if (filters?.since) {
      conditions.push('created_at > ?')
      params.push(filters.since)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const limit = filters?.limit || 100
    const offset = filters?.offset || 0

    const stmt = db.prepare(`
      SELECT * FROM events
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `)

    return stmt.all(...params, limit, offset) as Event[]
  },

  /**
   * Get a single event by ID
   */
  get(id: number): Event | null {
    const db = getDatabase()
    const event = db
      .prepare('SELECT * FROM events WHERE id = ?')
      .get(id) as Event | undefined
    return event ?? null
  },

  /**
   * Get all events for a ticket
   */
  getByTicket(ticketId: number): Event[] {
    const db = getDatabase()
    return db
      .prepare('SELECT * FROM events WHERE ticket_id = ? ORDER BY created_at DESC')
      .all(ticketId) as Event[]
  },

  /**
   * Create a new event
   */
  create(input: CreateEventInput): Event {
    const db = getDatabase()

    const result = db
      .prepare(
        `
      INSERT INTO events (
        event_type, project_id, ticket_id, comment_id,
        actor_id, actor_type, payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        input.event_type,
        input.project_id ?? null,
        input.ticket_id ?? null,
        input.comment_id ?? null,
        input.actor_id ?? null,
        input.actor_type,
        JSON.stringify(input.payload)
      )

    const event = this.get(result.lastInsertRowid as number) as Event

    // Notify listeners (for WebSocket broadcasting)
    for (const listener of listeners) {
      try {
        listener(event)
      } catch {
        // Don't let listener errors break event creation
      }
    }

    return event
  },

  /**
   * Get the latest event ID (for subscription tracking)
   */
  getLatestId(): number | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT MAX(id) as max_id FROM events')
      .get() as { max_id: number | null }
    return row.max_id
  },

  /**
   * Get events after a specific ID (for polling)
   */
  getAfter(afterId: number, limit = 100): Event[] {
    const db = getDatabase()
    return db
      .prepare('SELECT * FROM events WHERE id > ? ORDER BY id ASC LIMIT ?')
      .all(afterId, limit) as Event[]
  },
}
