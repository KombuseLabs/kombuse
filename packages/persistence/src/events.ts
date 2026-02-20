import type { ActorType, EventWithActor, EventFilters, CreateEventInput } from '@kombuse/types'
import { getDatabase } from './database'

// Raw event row with joined profile columns from LEFT JOIN
interface RawEventWithActor {
  id: number
  event_type: string
  project_id: string | null
  ticket_id: number | null
  comment_id: number | null
  actor_id: string | null
  actor_type: string
  kombuse_session_id: string | null
  payload: string
  created_at: string
  // Joined profile columns (nullable because LEFT JOIN)
  actor_profile_type: string | null
  actor_name: string | null
  actor_slug: string | null
  actor_email: string | null
  actor_description: string | null
  actor_avatar_url: string | null
  actor_external_source: string | null
  actor_external_id: string | null
  actor_is_active: number | null
  actor_created_at: string | null
  actor_updated_at: string | null
}

const EVENT_WITH_ACTOR_SELECT = `
  SELECT e.*,
    p.type AS actor_profile_type, p.name AS actor_name, p.slug AS actor_slug, p.email AS actor_email,
    p.description AS actor_description, p.avatar_url AS actor_avatar_url,
    p.external_source AS actor_external_source, p.external_id AS actor_external_id,
    p.is_active AS actor_is_active, p.created_at AS actor_created_at,
    p.updated_at AS actor_updated_at
  FROM events e
  LEFT JOIN profiles p ON p.id = e.actor_id
`

function mapEventWithActor(row: RawEventWithActor): EventWithActor {
  return {
    id: row.id,
    event_type: row.event_type,
    project_id: row.project_id,
    ticket_id: row.ticket_id,
    comment_id: row.comment_id,
    actor_id: row.actor_id,
    actor_type: row.actor_type as ActorType,
    kombuse_session_id: row.kombuse_session_id,
    payload: row.payload,
    created_at: row.created_at,
    actor: row.actor_id && row.actor_name ? {
      id: row.actor_id,
      type: row.actor_profile_type as 'user' | 'agent',
      name: row.actor_name,
      slug: row.actor_slug,
      email: row.actor_email,
      description: row.actor_description,
      avatar_url: row.actor_avatar_url,
      external_source: row.actor_external_source,
      external_id: row.actor_external_id,
      is_active: row.actor_is_active === 1,
      created_at: row.actor_created_at!,
      updated_at: row.actor_updated_at!,
    } : null,
  }
}

/**
 * Event listener type for WebSocket broadcasting
 */
type EventListener = (event: EventWithActor) => void
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
  list(filters?: EventFilters): EventWithActor[] {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.event_type) {
      conditions.push('e.event_type = ?')
      params.push(filters.event_type)
    }
    if (filters?.project_id) {
      conditions.push('e.project_id = ?')
      params.push(filters.project_id)
    }
    if (filters?.ticket_id) {
      conditions.push('e.ticket_id = ?')
      params.push(filters.ticket_id)
    }
    if (filters?.actor_id) {
      conditions.push('e.actor_id = ?')
      params.push(filters.actor_id)
    }
    if (filters?.actor_type) {
      conditions.push('e.actor_type = ?')
      params.push(filters.actor_type)
    }
    if (filters?.since) {
      conditions.push('e.created_at > ?')
      params.push(filters.since)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const limit = filters?.limit || 100
    const offset = filters?.offset || 0

    const rows = db.prepare(`
      ${EVENT_WITH_ACTOR_SELECT}
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as RawEventWithActor[]

    return rows.map(mapEventWithActor)
  },

  /**
   * Get a single event by ID
   */
  get(id: number): EventWithActor | null {
    const db = getDatabase()
    const row = db
      .prepare(`${EVENT_WITH_ACTOR_SELECT} WHERE e.id = ?`)
      .get(id) as RawEventWithActor | undefined
    return row ? mapEventWithActor(row) : null
  },

  /**
   * Get all events for a ticket
   */
  getByTicket(ticketId: number): EventWithActor[] {
    const db = getDatabase()
    const rows = db
      .prepare(`${EVENT_WITH_ACTOR_SELECT} WHERE e.ticket_id = ? ORDER BY e.created_at DESC`)
      .all(ticketId) as RawEventWithActor[]
    return rows.map(mapEventWithActor)
  },

  /**
   * Create a new event
   */
  create(input: CreateEventInput): EventWithActor {
    const db = getDatabase()

    const result = db
      .prepare(
        `
      INSERT INTO events (
        event_type, project_id, ticket_id, comment_id,
        actor_id, actor_type, kombuse_session_id, payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        input.event_type,
        input.project_id ?? null,
        input.ticket_id ?? null,
        input.comment_id ?? null,
        input.actor_id ?? null,
        input.actor_type,
        input.kombuse_session_id ?? null,
        JSON.stringify(input.payload)
      )

    const event = this.get(result.lastInsertRowid as number) as EventWithActor

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
  getAfter(afterId: number, limit = 100): EventWithActor[] {
    const db = getDatabase()
    const rows = db
      .prepare(`${EVENT_WITH_ACTOR_SELECT} WHERE e.id > ? ORDER BY e.id ASC LIMIT ?`)
      .all(afterId, limit) as RawEventWithActor[]
    return rows.map(mapEventWithActor)
  },
}
