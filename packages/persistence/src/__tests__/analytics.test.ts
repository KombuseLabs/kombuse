import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { setupTestDb, TEST_USER_ID, TEST_PROJECT_ID } from '../test-utils'
import { analyticsRepository } from '../analytics'
import { sessionsRepository } from '../sessions'
import { ticketsRepository } from '../tickets'

describe('analyticsRepository', () => {
  let cleanup: () => void
  let db: DatabaseType

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    db = setup.db

    // Create a test ticket (sessions require a project which setupTestDb provides)
    ticketsRepository.create({
      title: 'Test ticket for analytics',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
  })

  afterEach(() => {
    cleanup()
  })

  describe('sessionsPerDay', () => {
    it('should return empty array when no sessions exist for project', () => {
      const result = analyticsRepository.sessionsPerDay(TEST_PROJECT_ID)
      expect(result).toHaveLength(0)
    })

    it('should count sessions grouped by day', () => {
      const s1 = sessionsRepository.create({ project_id: TEST_PROJECT_ID })
      const s2 = sessionsRepository.create({ project_id: TEST_PROJECT_ID })
      const s3 = sessionsRepository.create({ project_id: TEST_PROJECT_ID })

      db.prepare("UPDATE sessions SET created_at = '2026-02-15 10:00:00' WHERE id = ?").run(s1.id)
      db.prepare("UPDATE sessions SET created_at = '2026-02-15 14:00:00' WHERE id = ?").run(s2.id)
      db.prepare("UPDATE sessions SET created_at = '2026-02-16 09:00:00' WHERE id = ?").run(s3.id)

      const result = analyticsRepository.sessionsPerDay(TEST_PROJECT_ID, 365)

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ date: '2026-02-15', count: 2 })
      expect(result[1]).toMatchObject({ date: '2026-02-16', count: 1 })
    })

    it('should only include sessions for the given project', () => {
      const otherProjectId = 'other-project'
      db.prepare(`
        INSERT INTO projects (id, name, owner_id)
        VALUES (?, 'Other Project', ?)
      `).run(otherProjectId, TEST_USER_ID)

      sessionsRepository.create({ project_id: TEST_PROJECT_ID })
      sessionsRepository.create({ project_id: otherProjectId })

      const result = analyticsRepository.sessionsPerDay(TEST_PROJECT_ID, 365)

      expect(result).toHaveLength(1)
      expect(result[0]!.count).toBe(1)
    })

    it('should respect the days parameter', () => {
      const session = sessionsRepository.create({ project_id: TEST_PROJECT_ID })
      db.prepare("UPDATE sessions SET created_at = date('now', '-60 days') WHERE id = ?").run(session.id)

      const last30 = analyticsRepository.sessionsPerDay(TEST_PROJECT_ID, 30)
      const last90 = analyticsRepository.sessionsPerDay(TEST_PROJECT_ID, 90)

      expect(last30).toHaveLength(0)
      expect(last90).toHaveLength(1)
    })

    it('should return dates sorted ascending', () => {
      const s1 = sessionsRepository.create({ project_id: TEST_PROJECT_ID })
      const s2 = sessionsRepository.create({ project_id: TEST_PROJECT_ID })

      db.prepare("UPDATE sessions SET created_at = '2026-02-10 10:00:00' WHERE id = ?").run(s1.id)
      db.prepare("UPDATE sessions SET created_at = '2026-02-05 10:00:00' WHERE id = ?").run(s2.id)

      const result = analyticsRepository.sessionsPerDay(TEST_PROJECT_ID, 365)

      expect(result).toHaveLength(2)
      expect(result[0]!.date).toBe('2026-02-05')
      expect(result[1]!.date).toBe('2026-02-10')
    })
  })
})
