import { getDatabase } from './database'
import type {
  SessionDurationPercentile,
  PipelineStageDuration,
  ToolReadFrequency,
  ToolCallsPerSession,
  ToolDurationPercentile,
  ToolCallVolume,
} from '@kombuse/types'

export const analyticsRepository = {
  /**
   * Aggregate session counts per calendar day for a given project.
   * Returns rows sorted by date ascending (oldest first).
   */
  sessionsPerDay(projectId: string, days = 30): Array<{ date: string; count: number }> {
    const db = getDatabase()
    return db
      .prepare(
        `
        SELECT date(created_at) AS date, COUNT(*) AS count
        FROM sessions
        WHERE project_id = ?
          AND created_at >= date('now', ? || ' days')
        GROUP BY date(created_at)
        ORDER BY date ASC
      `
      )
      .all(projectId, -days) as Array<{ date: string; count: number }>
  },

  durationPercentiles(projectId: string, days = 30): SessionDurationPercentile[] {
    const db = getDatabase()
    return db
      .prepare(
        `
        WITH completed AS (
          SELECT
            s.agent_id,
            COALESCE(p.name, 'Unknown') AS agent_name,
            (julianday(s.completed_at) - julianday(s.started_at)) * 86400000.0 AS duration_ms
          FROM sessions s
          LEFT JOIN profiles p ON p.id = s.agent_id
          WHERE s.project_id = ?
            AND s.status = 'completed'
            AND s.completed_at IS NOT NULL
            AND s.started_at IS NOT NULL
            AND s.started_at >= date('now', ? || ' days')
        ),
        ranked AS (
          SELECT
            agent_id,
            agent_name,
            duration_ms,
            ROW_NUMBER() OVER (PARTITION BY agent_id ORDER BY duration_ms) AS rn,
            COUNT(*) OVER (PARTITION BY agent_id) AS cnt
          FROM completed
        )
        SELECT
          agent_id,
          agent_name,
          ROUND(AVG(duration_ms)) AS avg,
          COUNT(*) AS count,
          COALESCE(MAX(CASE WHEN rn = CAST(cnt * 0.50 AS INTEGER) + 1 THEN duration_ms END), ROUND(AVG(duration_ms))) AS p50,
          COALESCE(MAX(CASE WHEN rn = CAST(cnt * 0.90 AS INTEGER) + 1 THEN duration_ms END), ROUND(AVG(duration_ms))) AS p90,
          COALESCE(MAX(CASE WHEN rn = CAST(cnt * 0.99 AS INTEGER) + 1 THEN duration_ms END), ROUND(AVG(duration_ms))) AS p99
        FROM ranked
        GROUP BY agent_id, agent_name
        ORDER BY count DESC
      `
      )
      .all(projectId, -days) as SessionDurationPercentile[]
  },

  pipelineStageDuration(projectId: string, days = 30): PipelineStageDuration[] {
    const db = getDatabase()
    return db
      .prepare(
        `
        WITH invocations AS (
          SELECT
            ai.agent_id,
            COALESCE(p.name, 'Unknown') AS agent_name,
            (julianday(ai.completed_at) - julianday(ai.started_at)) * 86400000.0 AS duration_ms
          FROM agent_invocations ai
          LEFT JOIN profiles p ON p.id = ai.agent_id
          WHERE ai.project_id = ?
            AND ai.status = 'completed'
            AND ai.started_at IS NOT NULL
            AND ai.completed_at IS NOT NULL
            AND ai.started_at >= date('now', ? || ' days')
        ),
        ranked AS (
          SELECT
            agent_id,
            agent_name,
            duration_ms,
            ROW_NUMBER() OVER (PARTITION BY agent_id ORDER BY duration_ms) AS rn,
            COUNT(*) OVER (PARTITION BY agent_id) AS cnt
          FROM invocations
        )
        SELECT
          agent_id,
          agent_name,
          ROUND(AVG(duration_ms)) AS avg_duration,
          COUNT(*) AS count,
          COALESCE(MAX(CASE WHEN rn = CAST(cnt * 0.50 AS INTEGER) + 1 THEN duration_ms END), ROUND(AVG(duration_ms))) AS p50,
          COALESCE(MAX(CASE WHEN rn = CAST(cnt * 0.90 AS INTEGER) + 1 THEN duration_ms END), ROUND(AVG(duration_ms))) AS p90
        FROM ranked
        GROUP BY agent_id, agent_name
        ORDER BY count DESC
      `
      )
      .all(projectId, -days) as PipelineStageDuration[]
  },

  mostFrequentReads(projectId: string, days = 30, limit = 25): ToolReadFrequency[] {
    const db = getDatabase()
    return db
      .prepare(
        `
        SELECT
          json_extract(se.payload, '$.input.file_path') AS file_path,
          COUNT(*) AS read_count
        FROM session_events se
        JOIN sessions s ON s.id = se.session_id
        WHERE se.event_type = 'tool_use'
          AND json_extract(se.payload, '$.name') = 'Read'
          AND s.project_id = ?
          AND se.created_at >= date('now', ? || ' days')
        GROUP BY file_path
        HAVING file_path IS NOT NULL
        ORDER BY read_count DESC
        LIMIT ?
      `
      )
      .all(projectId, -days, limit) as ToolReadFrequency[]
  },

  toolCallsPerSession(projectId: string, days = 30, agentId?: string): ToolCallsPerSession[] {
    const db = getDatabase()
    if (agentId) {
      return db
        .prepare(
          `
          SELECT
            se.session_id,
            s.agent_id,
            COALESCE(p.name, 'Unknown') AS agent_name,
            COUNT(*) AS call_count
          FROM session_events se
          JOIN sessions s ON s.id = se.session_id
          LEFT JOIN profiles p ON p.id = s.agent_id
          WHERE se.event_type = 'tool_use'
            AND s.project_id = ?
            AND se.created_at >= date('now', ? || ' days')
            AND s.agent_id = ?
          GROUP BY se.session_id, s.agent_id
          ORDER BY call_count DESC
          LIMIT 50
        `
        )
        .all(projectId, -days, agentId) as ToolCallsPerSession[]
    }
    return db
      .prepare(
        `
        SELECT
          se.session_id,
          s.agent_id,
          COALESCE(p.name, 'Unknown') AS agent_name,
          COUNT(*) AS call_count
        FROM session_events se
        JOIN sessions s ON s.id = se.session_id
        LEFT JOIN profiles p ON p.id = s.agent_id
        WHERE se.event_type = 'tool_use'
          AND s.project_id = ?
          AND se.created_at >= date('now', ? || ' days')
        GROUP BY se.session_id, s.agent_id
        ORDER BY call_count DESC
        LIMIT 50
      `
      )
      .all(projectId, -days) as ToolCallsPerSession[]
  },

  slowestTools(projectId: string, days = 30): ToolDurationPercentile[] {
    const db = getDatabase()
    return db
      .prepare(
        `
        WITH tool_durations AS (
          SELECT
            json_extract(tu.payload, '$.name') AS tool_name,
            CAST(json_extract(tr.payload, '$.timestamp') AS REAL) -
              CAST(json_extract(tu.payload, '$.timestamp') AS REAL) AS duration_ms
          FROM session_events tu
          INNER JOIN session_events tr
            ON tr.session_id = tu.session_id
            AND tr.event_type = 'tool_result'
            AND json_extract(tr.payload, '$.toolUseId') = json_extract(tu.payload, '$.id')
          INNER JOIN sessions s ON s.id = tu.session_id
          WHERE tu.event_type = 'tool_use'
            AND s.project_id = ?
            AND tu.created_at >= date('now', ? || ' days')
        ),
        ranked AS (
          SELECT
            tool_name,
            duration_ms,
            ROW_NUMBER() OVER (PARTITION BY tool_name ORDER BY duration_ms) AS rn,
            COUNT(*) OVER (PARTITION BY tool_name) AS cnt
          FROM tool_durations
          WHERE duration_ms > 0
        )
        SELECT
          tool_name,
          COUNT(*) AS count,
          ROUND(AVG(duration_ms)) AS avg,
          COALESCE(MAX(CASE WHEN rn = CAST(cnt * 0.50 AS INTEGER) + 1 THEN duration_ms END), ROUND(AVG(duration_ms))) AS p50,
          COALESCE(MAX(CASE WHEN rn = CAST(cnt * 0.90 AS INTEGER) + 1 THEN duration_ms END), ROUND(AVG(duration_ms))) AS p90,
          COALESCE(MAX(CASE WHEN rn = CAST(cnt * 0.99 AS INTEGER) + 1 THEN duration_ms END), ROUND(AVG(duration_ms))) AS p99
        FROM ranked
        GROUP BY tool_name
        ORDER BY p90 DESC
        LIMIT 50
      `
      )
      .all(projectId, -days) as ToolDurationPercentile[]
  },

  toolCallVolume(projectId: string, days = 30): ToolCallVolume[] {
    const db = getDatabase()
    return db
      .prepare(
        `
        SELECT
          json_extract(se.payload, '$.name') AS tool_name,
          COUNT(*) AS call_count,
          COUNT(DISTINCT se.session_id) AS session_count
        FROM session_events se
        JOIN sessions s ON s.id = se.session_id
        WHERE se.event_type = 'tool_use'
          AND s.project_id = ?
          AND se.created_at >= date('now', ? || ' days')
        GROUP BY tool_name
        ORDER BY call_count DESC
        LIMIT 50
      `
      )
      .all(projectId, -days) as ToolCallVolume[]
  },
}
