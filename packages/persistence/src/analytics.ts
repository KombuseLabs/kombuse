import { getDatabase } from './database'
import type { SessionDurationPercentile, PipelineStageDuration } from '@kombuse/types'

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
          MAX(CASE WHEN rn = CAST(cnt * 0.50 AS INTEGER) + 1 THEN duration_ms END) AS p50,
          MAX(CASE WHEN rn = CAST(cnt * 0.90 AS INTEGER) + 1 THEN duration_ms END) AS p90,
          MAX(CASE WHEN rn = CAST(cnt * 0.99 AS INTEGER) + 1 THEN duration_ms END) AS p99
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
          MAX(CASE WHEN rn = CAST(cnt * 0.50 AS INTEGER) + 1 THEN duration_ms END) AS p50,
          MAX(CASE WHEN rn = CAST(cnt * 0.90 AS INTEGER) + 1 THEN duration_ms END) AS p90
        FROM ranked
        GROUP BY agent_id, agent_name
        ORDER BY count DESC
      `
      )
      .all(projectId, -days) as PipelineStageDuration[]
  },
}
