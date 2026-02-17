import { getDatabase } from './database'

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
}
