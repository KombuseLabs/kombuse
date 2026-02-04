import type {
  SessionEvent,
  SessionEventFilters,
  CreateSessionEventInput,
} from '@kombuse/types'
import { getDatabase } from './database'

/**
 * Raw type from database (payload stored as JSON string)
 */
interface RawSessionEvent {
  id: number
  session_id: string
  seq: number
  event_type: string
  payload: string
  created_at: string
}

/**
 * Map database row to typed entity
 */
function mapSessionEvent(row: RawSessionEvent): SessionEvent {
  return {
    id: row.id,
    session_id: row.session_id,
    seq: row.seq,
    event_type: row.event_type,
    payload: JSON.parse(row.payload),
    created_at: row.created_at,
  }
}

/**
 * Data access layer for session events (agent conversation history)
 */
export const sessionEventsRepository = {
  /**
   * List events with optional filters
   */
  list(filters?: SessionEventFilters): SessionEvent[] {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.session_id) {
      conditions.push('session_id = ?')
      params.push(filters.session_id)
    }
    if (filters?.event_type) {
      conditions.push('event_type = ?')
      params.push(filters.event_type)
    }
    if (filters?.since_seq !== undefined) {
      conditions.push('seq > ?')
      params.push(filters.since_seq)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const limit = filters?.limit ?? 1000
    const offset = filters?.offset ?? 0

    const rows = db
      .prepare(
        `
        SELECT * FROM session_events
        ${whereClause}
        ORDER BY seq ASC
        LIMIT ? OFFSET ?
      `
      )
      .all(...params, limit, offset) as RawSessionEvent[]

    return rows.map(mapSessionEvent)
  },

  /**
   * Get a single event by ID
   */
  get(id: number): SessionEvent | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM session_events WHERE id = ?')
      .get(id) as RawSessionEvent | undefined
    return row ? mapSessionEvent(row) : null
  },

  /**
   * Get events for a session by session_id, optionally filtering to events after a sequence number
   */
  getBySession(sessionId: string, sinceSeq?: number): SessionEvent[] {
    const db = getDatabase()

    if (sinceSeq !== undefined) {
      const rows = db
        .prepare(
          `
          SELECT * FROM session_events
          WHERE session_id = ? AND seq > ?
          ORDER BY seq ASC
        `
        )
        .all(sessionId, sinceSeq) as RawSessionEvent[]
      return rows.map(mapSessionEvent)
    }

    const rows = db
      .prepare(
        `
        SELECT * FROM session_events
        WHERE session_id = ?
        ORDER BY seq ASC
      `
      )
      .all(sessionId) as RawSessionEvent[]
    return rows.map(mapSessionEvent)
  },

  /**
   * Create a new session event
   */
  create(input: CreateSessionEventInput): SessionEvent {
    const db = getDatabase()

    const result = db
      .prepare(
        `
        INSERT INTO session_events (session_id, seq, event_type, payload)
        VALUES (?, ?, ?, ?)
      `
      )
      .run(
        input.session_id,
        input.seq,
        input.event_type,
        JSON.stringify(input.payload)
      )

    return this.get(result.lastInsertRowid as number) as SessionEvent
  },

  /**
   * Bulk insert events (for efficiency when persisting multiple events)
   */
  createMany(events: CreateSessionEventInput[]): number {
    const db = getDatabase()

    const insert = db.prepare(`
      INSERT INTO session_events (session_id, seq, event_type, payload)
      VALUES (?, ?, ?, ?)
    `)

    const insertMany = db.transaction((evts: CreateSessionEventInput[]) => {
      for (const evt of evts) {
        insert.run(
          evt.session_id,
          evt.seq,
          evt.event_type,
          JSON.stringify(evt.payload)
        )
      }
      return evts.length
    })

    return insertMany(events)
  },

  /**
   * Get the next sequence number for a session
   */
  getNextSeq(sessionId: string): number {
    const db = getDatabase()
    const row = db
      .prepare(
        'SELECT MAX(seq) as max_seq FROM session_events WHERE session_id = ?'
      )
      .get(sessionId) as { max_seq: number | null }
    return (row.max_seq ?? 0) + 1
  },

  /**
   * Delete all events for a session (for cleanup)
   */
  deleteBySession(sessionId: string): number {
    const db = getDatabase()
    const result = db
      .prepare('DELETE FROM session_events WHERE session_id = ?')
      .run(sessionId)
    return result.changes
  },
}
