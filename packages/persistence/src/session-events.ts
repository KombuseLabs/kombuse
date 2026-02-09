import type {
  SessionEvent,
  SessionEventFilters,
  CreateSessionEventInput,
  PermissionLogEntry,
  PermissionLogFilters,
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
 * Raw type from database for permission log query
 */
interface RawPermissionLogEntry {
  id: number
  session_id: string
  requested_at: string
  request_id: string
  tool_name: string
  description: string | null
  auto_approved: number | null
  resolved_at: string | null
  behavior: string | null
  deny_message: string | null
}

function mapPermissionLogEntry(row: RawPermissionLogEntry): PermissionLogEntry {
  return {
    id: row.id,
    session_id: row.session_id,
    requested_at: row.requested_at,
    request_id: row.request_id,
    tool_name: row.tool_name,
    description: row.description,
    auto_approved: row.auto_approved === 1,
    behavior: row.auto_approved === 1
      ? 'allow'
      : (row.behavior as 'allow' | 'deny' | null),
    deny_message: row.deny_message,
    resolved_at: row.resolved_at,
  }
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

  /**
   * List permission log entries (request + response pairs) for a project.
   */
  listPermissions(filters: PermissionLogFilters): PermissionLogEntry[] {
    const db = getDatabase()
    const conditions: string[] = [
      'req.event_type = ?',
    ]
    const params: unknown[] = ['permission_request']

    if (filters.project_id) {
      conditions.push('t.project_id = ?')
      params.push(filters.project_id)
    }

    if (filters.tool_name) {
      conditions.push("json_extract(req.payload, '$.toolName') = ?")
      params.push(filters.tool_name)
    }

    if (filters.behavior === 'auto_approved') {
      conditions.push("json_extract(req.payload, '$.autoApproved') = 1")
    } else if (filters.behavior === 'allow') {
      conditions.push("json_extract(req.payload, '$.autoApproved') IS NOT 1")
      conditions.push("json_extract(res.payload, '$.behavior') = 'allow'")
    } else if (filters.behavior === 'deny') {
      conditions.push("json_extract(res.payload, '$.behavior') = 'deny'")
    }

    const limit = filters.limit ?? 50
    const offset = filters.offset ?? 0

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = db
      .prepare(
        `
        SELECT
          req.id,
          req.session_id,
          req.created_at as requested_at,
          json_extract(req.payload, '$.requestId') as request_id,
          json_extract(req.payload, '$.toolName') as tool_name,
          json_extract(req.payload, '$.description') as description,
          json_extract(req.payload, '$.autoApproved') as auto_approved,
          res.created_at as resolved_at,
          json_extract(res.payload, '$.behavior') as behavior,
          json_extract(res.payload, '$.message') as deny_message
        FROM session_events req
        JOIN sessions s ON s.id = req.session_id
        JOIN tickets t ON t.id = s.ticket_id
        LEFT JOIN session_events res
          ON res.session_id = req.session_id
          AND res.event_type = 'permission_response'
          AND json_extract(res.payload, '$.requestId') = json_extract(req.payload, '$.requestId')
        ${whereClause}
        ORDER BY req.created_at DESC
        LIMIT ? OFFSET ?
        `
      )
      .all(...params, limit, offset) as RawPermissionLogEntry[]

    return rows.map(mapPermissionLogEntry)
  },
}
