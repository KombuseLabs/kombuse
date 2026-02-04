import type { Session, CreateSessionInput, SessionFilters } from '@kombuse/types'
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

    const limit = filters?.limit || 100
    const offset = filters?.offset || 0

    const stmt = db.prepare(`
      SELECT * FROM sessions
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `)

    const rows = stmt.all(limit, offset) as Session[]
    return rows
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
        INSERT INTO sessions (id, kombuse_session_id, backend_type, backend_session_id)
        VALUES (?, ?, ?, ?)
      `
      )
      .run(
        id,
        input?.kombuse_session_id ?? null,
        input?.backend_type ?? null,
        input?.backend_session_id ?? null
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
}
