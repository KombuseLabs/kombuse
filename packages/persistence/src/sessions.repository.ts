import type {
  Session,
  CreateSessionInput,
  SessionFilters,
  UpdateSessionInput,
} from '@kombuse/types'
import { getDatabase } from './database'

/**
 * Parse a raw database row into a Session, deserializing the JSON metadata field.
 */
function parseSessionRow(row: Record<string, unknown>): Session {
  return {
    ...row,
    metadata:
      typeof row.metadata === 'string'
        ? JSON.parse(row.metadata)
        : (row.metadata ?? {}),
  } as Session
}

function parseSessionRows(rows: Record<string, unknown>[]): Session[] {
  return rows.map(parseSessionRow)
}

function buildSessionFilters(filters?: SessionFilters, extraConditions?: string[], extraParams?: unknown[]): {
  conditions: string[]
  params: unknown[]
} {
  const conditions: string[] = [...(extraConditions ?? [])]
  const params: unknown[] = [...(extraParams ?? [])]

  if (filters?.ticket_id !== undefined) {
    conditions.push('s.ticket_id = ?')
    params.push(filters.ticket_id)
  }
  if (filters?.project_id !== undefined) {
    conditions.push('s.project_id = ?')
    params.push(filters.project_id)
  }
  if (filters?.status) {
    conditions.push('s.status = ?')
    params.push(filters.status)
  }
  if (filters?.terminal_reason) {
    conditions.push("json_extract(s.metadata, '$.terminal_reason') = ?")
    params.push(filters.terminal_reason)
  }
  if (filters?.has_backend_session_id === true) {
    conditions.push("s.backend_session_id IS NOT NULL AND trim(s.backend_session_id) <> ''")
  }
  if (filters?.has_backend_session_id === false) {
    conditions.push("(s.backend_session_id IS NULL OR trim(s.backend_session_id) = '')")
  }
  if (filters?.agent_id !== undefined) {
    conditions.push('s.agent_id = ?')
    params.push(filters.agent_id)
  }

  return { conditions, params }
}

const SESSION_LIST_SELECT = `
  SELECT s.*,
    COALESCE(
      p_agent.name,
      (SELECT p2.name FROM agent_invocations ai2
       JOIN profiles p2 ON p2.id = ai2.agent_id
       WHERE ai2.kombuse_session_id = s.kombuse_session_id
       ORDER BY ai2.created_at DESC LIMIT 1)
    ) AS agent_name,
    (SELECT substr(json_extract(se.payload, '$.content'), 1, 80)
     FROM session_events se
     WHERE se.session_id = s.id AND se.seq = 1 AND se.event_type = 'message'
    ) AS prompt_preview,
    t.ticket_number AS ticket_number
  FROM sessions s
  LEFT JOIN profiles p_agent ON p_agent.id = s.agent_id
  LEFT JOIN tickets t ON t.id = s.ticket_id
`

/**
 * Data access layer for sessions
 */
export const sessionsRepository = {
  /**
   * List all sessions with optional filters
   */
  list(filters?: SessionFilters): Session[] {
    const db = getDatabase()
    const { conditions, params } = buildSessionFilters(filters)

    const limit = filters?.limit || 100
    const offset = filters?.offset || 0
    params.push(limit, offset)

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const sortColumn = filters?.sort_by === 'created_at' ? 'created_at' : 'updated_at'

    const stmt = db.prepare(`
      ${SESSION_LIST_SELECT}
      ${whereClause}
      ORDER BY s.${sortColumn} DESC
      LIMIT ? OFFSET ?
    `)

    return parseSessionRows(stmt.all(...params) as Record<string, unknown>[])
  },

  /**
   * Get a single session by ID
   */
  get(id: string): Session | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined
    return row ? parseSessionRow(row) : null
  },

  /**
   * Create a new session
   */
  create(input?: CreateSessionInput): Session {
    const db = getDatabase()
    const id = input?.id || crypto.randomUUID()
    const metadata = input?.metadata ? JSON.stringify(input.metadata) : '{}'

    const row = db
      .prepare(
        `
        INSERT INTO sessions (id, kombuse_session_id, backend_type, backend_session_id, ticket_id, project_id, agent_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `
      )
      .get(
        id,
        input?.kombuse_session_id ?? null,
        input?.backend_type ?? null,
        input?.backend_session_id ?? null,
        input?.ticket_id ?? null,
        input?.project_id ?? null,
        input?.agent_id ?? null,
        metadata
      ) as Record<string, unknown>

    return parseSessionRow(row)
  },

  /**
   * Update session timestamp
   */
  touch(id: string): Session | null {
    const db = getDatabase()

    const row = db.prepare("UPDATE sessions SET updated_at = datetime('now') WHERE id = ? RETURNING *").get(id) as Record<string, unknown> | undefined
    return row ? parseSessionRow(row) : null
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
   * Update session fields
   */
  update(id: string, input: UpdateSessionInput): Session | null {
    const db = getDatabase()

    const fields: string[] = []
    const params: unknown[] = []

    if (input.backend_type !== undefined) {
      fields.push('backend_type = ?')
      params.push(input.backend_type)
    }
    if (input.backend_session_id !== undefined) {
      fields.push('backend_session_id = ?')
      params.push(input.backend_session_id)
    }
    if (input.project_id !== undefined) {
      fields.push('project_id = ?')
      params.push(input.project_id)
    }
    if (input.status !== undefined) {
      fields.push('status = ?')
      params.push(input.status)
    }
    if (input.metadata !== undefined) {
      fields.push('metadata = ?')
      params.push(JSON.stringify(input.metadata))
    }
    if (input.completed_at !== undefined) {
      fields.push('completed_at = ?')
      params.push(input.completed_at)
    }
    if (input.failed_at !== undefined) {
      fields.push('failed_at = ?')
      params.push(input.failed_at)
    }
    if (input.aborted_at !== undefined) {
      fields.push('aborted_at = ?')
      params.push(input.aborted_at)
    }
    if (input.last_event_seq !== undefined) {
      fields.push('last_event_seq = ?')
      params.push(input.last_event_seq)
    }
    if (input.agent_id !== undefined) {
      fields.push('agent_id = ?')
      params.push(input.agent_id)
    }

    if (fields.length === 0) return this.get(id)

    fields.push("updated_at = datetime('now')")
    params.push(id)

    const row = db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ? RETURNING *`).get(
      ...params
    ) as Record<string, unknown> | undefined
    return row ? parseSessionRow(row) : null
  },

  /**
   * Get session by kombuse session ID.
   * Accepts any string to support legacy IDs and API lookups.
   */
  getByKombuseSessionId(kombuseSessionId: string): Session | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM sessions WHERE kombuse_session_id = ?')
      .get(kombuseSessionId) as Record<string, unknown> | undefined
    return row ? parseSessionRow(row) : null
  },

  /**
   * List all sessions for a specific ticket
   */
  listByTicket(ticketId: number, filters?: SessionFilters): Session[] {
    const db = getDatabase()
    const { conditions, params } = buildSessionFilters(filters, ['s.ticket_id = ?'], [ticketId])

    const limit = filters?.limit || 100
    const offset = filters?.offset || 0
    params.push(limit, offset)

    const sortColumn = filters?.sort_by === 'created_at' ? 'created_at' : 'updated_at'

    const stmt = db.prepare(`
      ${SESSION_LIST_SELECT}
      WHERE ${conditions.join(' AND ')}
      ORDER BY s.${sortColumn} DESC
      LIMIT ? OFFSET ?
    `)

    return parseSessionRows(stmt.all(...params) as Record<string, unknown>[])
  },

  /**
   * Aggregate session diagnostics to help identify abrupt abort causes.
   */
  diagnostics(recentLimit = 20): {
    generated_at: string
    counts_by_status: Record<string, number>
    aborted_by_reason: Array<{ reason: string; count: number }>
    terminal_timestamp_gaps: {
      completed_missing_timestamp: number
      failed_missing_timestamp: number
      aborted_missing_timestamp: number
    }
    recent_aborted_without_backend_session_id: Array<{
      id: string
      kombuse_session_id: string | null
      ticket_id: number | null
      backend_type: string | null
      backend_session_id: string | null
      status: string
      updated_at: string
      completed_at: string | null
      failed_at: string | null
      aborted_at: string | null
      terminal_reason: string | null
      terminal_source: string | null
    }>
  } {
    const db = getDatabase()

    const countsRows = db
      .prepare(
        `
        SELECT status, COUNT(*) AS count
        FROM sessions
        GROUP BY status
      `
      )
      .all() as Array<{ status: string; count: number }>

    const counts_by_status: Record<string, number> = {}
    for (const row of countsRows) {
      counts_by_status[row.status] = row.count
    }

    const aborted_by_reason = db
      .prepare(
        `
        SELECT
          COALESCE(json_extract(metadata, '$.terminal_reason'), 'unspecified') AS reason,
          COUNT(*) AS count
        FROM sessions
        WHERE status = 'aborted'
        GROUP BY reason
        ORDER BY count DESC, reason ASC
      `
      )
      .all() as Array<{ reason: string; count: number }>

    const completedGap = db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM sessions
        WHERE status = 'completed'
          AND completed_at IS NULL
      `
      )
      .get() as { count: number }

    const failedGap = db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM sessions
        WHERE status = 'failed'
          AND failed_at IS NULL
      `
      )
      .get() as { count: number }

    const abortedGap = db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM sessions
        WHERE status = 'aborted'
          AND aborted_at IS NULL
      `
      )
      .get() as { count: number }

    const recent_aborted_without_backend_session_id = db
      .prepare(
        `
        SELECT
          id,
          kombuse_session_id,
          ticket_id,
          backend_type,
          backend_session_id,
          status,
          updated_at,
          completed_at,
          failed_at,
          aborted_at,
          json_extract(metadata, '$.terminal_reason') AS terminal_reason,
          json_extract(metadata, '$.terminal_source') AS terminal_source
        FROM sessions
        WHERE status = 'aborted'
          AND (backend_session_id IS NULL OR trim(backend_session_id) = '')
        ORDER BY COALESCE(aborted_at, failed_at, updated_at) DESC
        LIMIT ?
      `
      )
      .all(recentLimit) as Array<{
      id: string
      kombuse_session_id: string | null
      ticket_id: number | null
      backend_type: string | null
      backend_session_id: string | null
      status: string
      updated_at: string
      completed_at: string | null
      failed_at: string | null
      aborted_at: string | null
      terminal_reason: string | null
      terminal_source: string | null
    }>

    return {
      generated_at: new Date().toISOString(),
      counts_by_status,
      aborted_by_reason,
      terminal_timestamp_gaps: {
        completed_missing_timestamp: completedGap.count,
        failed_missing_timestamp: failedGap.count,
        aborted_missing_timestamp: abortedGap.count,
      },
      recent_aborted_without_backend_session_id,
    }
  },

  /**
   * Abort all sessions currently in 'running' or 'pending' status.
   * Used at server startup to clean up orphaned sessions from prior runs.
   * Returns the number of sessions aborted.
   */
  abortAllRunningSessions(): number {
    const db = getDatabase()
    const result = db
      .prepare(
        `
        UPDATE sessions
        SET status = 'aborted',
            completed_at = NULL,
            failed_at = COALESCE(failed_at, datetime('now')),
            aborted_at = COALESCE(aborted_at, datetime('now')),
            updated_at = datetime('now')
        WHERE status IN ('running', 'pending')
      `
      )
      .run()
    return result.changes
  },

  /**
   * Find the most recent session for a given ticket + agent combination,
   * prioritizing running/pending sessions, then terminal sessions with a
   * backend_session_id that can be resumed.
   */
  findMostRecentForTicketAgent(ticketId: number, agentId: string): Session | null {
    const db = getDatabase()
    const row = db
      .prepare(
        `
        SELECT *
        FROM sessions
        WHERE ticket_id = ?
          AND agent_id = ?
          AND (
            status IN ('running', 'pending')
            OR (
              status IN ('completed', 'failed', 'aborted', 'stopped')
              AND backend_session_id IS NOT NULL
              AND trim(backend_session_id) <> ''
            )
          )
        ORDER BY
          CASE WHEN status IN ('running', 'pending') THEN 0 ELSE 1 END,
          updated_at DESC
        LIMIT 1
      `
      )
      .get(ticketId, agentId) as Record<string, unknown> | undefined
    return row ? parseSessionRow(row) : null
  },
}
