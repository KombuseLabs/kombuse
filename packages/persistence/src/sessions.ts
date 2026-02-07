import type {
  Session,
  CreateSessionInput,
  SessionFilters,
  UpdateSessionInput,
} from '@kombuse/types'
import { getDatabase } from './database'

/**
 * Data access layer for sessions
 */
export const sessionsRepository = {
  /**
   * List all sessions with optional filters
   */
  list(filters?: SessionFilters): Session[] {
    const db = getDatabase()

    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.ticket_id !== undefined) {
      conditions.push('ticket_id = ?')
      params.push(filters.ticket_id)
    }
    if (filters?.status) {
      conditions.push('status = ?')
      params.push(filters.status)
    }

    const limit = filters?.limit || 100
    const offset = filters?.offset || 0
    params.push(limit, offset)

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const stmt = db.prepare(`
      SELECT * FROM sessions
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `)

    return stmt.all(...params) as Session[]
  },

  /**
   * Get a single session by ID
   */
  get(id: string): Session | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(id) as Session | undefined
    return row ?? null
  },

  /**
   * Create a new session
   */
  create(input?: CreateSessionInput): Session {
    const db = getDatabase()
    const id = input?.id || crypto.randomUUID()

    db
      .prepare(
        `
        INSERT INTO sessions (id, kombuse_session_id, backend_type, backend_session_id, ticket_id)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(
        id,
        input?.kombuse_session_id ?? null,
        input?.backend_type ?? null,
        input?.backend_session_id ?? null,
        input?.ticket_id ?? null
      )

    return this.get(id) as Session
  },

  /**
   * Update session timestamp
   */
  touch(id: string): Session | null {
    const db = getDatabase()

    db.prepare("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?").run(id)

    return this.get(id)
  },

  /**
   * Delete a session
   */
  delete(id: string): boolean {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    return result.changes > 0
  },

  /**
   * Update session metadata
   */
  update(id: string, input: UpdateSessionInput): Session | null {
    const db = getDatabase()

    const fields: string[] = []
    const params: unknown[] = []

    if (input.backend_session_id !== undefined) {
      fields.push('backend_session_id = ?')
      params.push(input.backend_session_id)
    }
    if (input.status !== undefined) {
      fields.push('status = ?')
      params.push(input.status)
    }
    if (input.completed_at !== undefined) {
      fields.push('completed_at = ?')
      params.push(input.completed_at)
    }
    if (input.failed_at !== undefined) {
      fields.push('failed_at = ?')
      params.push(input.failed_at)
    }
    if (input.last_event_seq !== undefined) {
      fields.push('last_event_seq = ?')
      params.push(input.last_event_seq)
    }

    if (fields.length === 0) return this.get(id)

    fields.push("updated_at = datetime('now')")
    params.push(id)

    db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(
      ...params
    )

    return this.get(id)
  },

  /**
   * Get session by kombuse session ID.
   * Accepts any string to support legacy IDs and API lookups.
   */
  getByKombuseSessionId(kombuseSessionId: string): Session | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM sessions WHERE kombuse_session_id = ?')
      .get(kombuseSessionId) as Session | undefined
    return row ?? null
  },

  /**
   * List all sessions for a specific ticket
   */
  listByTicket(ticketId: number, filters?: SessionFilters): Session[] {
    const db = getDatabase()

    const conditions: string[] = ['ticket_id = ?']
    const params: unknown[] = [ticketId]

    if (filters?.status) {
      conditions.push('status = ?')
      params.push(filters.status)
    }

    const limit = filters?.limit || 100
    const offset = filters?.offset || 0
    params.push(limit, offset)

    const stmt = db.prepare(`
      SELECT * FROM sessions
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `)

    return stmt.all(...params) as Session[]
  },

  /**
   * Abort all sessions currently in 'running' status.
   * Used at server startup to clean up orphaned sessions from prior runs.
   * Returns the number of sessions aborted.
   */
  abortAllRunningSessions(): number {
    const db = getDatabase()
    const result = db
      .prepare(
        "UPDATE sessions SET status = 'aborted', updated_at = datetime('now') WHERE status = 'running'"
      )
      .run()
    return result.changes
  },
}
