import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { setupTestDb, TEST_USER_ID, TEST_AGENT_ID, TEST_PROJECT_ID } from '../test-utils'
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

  describe('durationPercentiles', () => {
    beforeEach(() => {
      db.prepare(
        `INSERT INTO agents (id, system_prompt, is_enabled) VALUES (?, 'test prompt', 1)`
      ).run(TEST_AGENT_ID)
    })

    it('should return empty array when no completed sessions exist', () => {
      const result = analyticsRepository.durationPercentiles(TEST_PROJECT_ID)
      expect(result).toHaveLength(0)
    })

    it('should compute percentiles for completed sessions', () => {
      for (let i = 1; i <= 10; i++) {
        const s = sessionsRepository.create({ project_id: TEST_PROJECT_ID, agent_id: TEST_AGENT_ID })
        db.prepare(
          `UPDATE sessions SET status = 'completed',
             started_at = datetime('now', '-${i * 100} seconds'),
             completed_at = datetime('now')
           WHERE id = ?`
        ).run(s.id)
      }

      const result = analyticsRepository.durationPercentiles(TEST_PROJECT_ID, 365)

      expect(result).toHaveLength(1)
      const row = result[0]!
      expect(row.agent_id).toBe(TEST_AGENT_ID)
      expect(row.agent_name).toBe('Test Agent')
      expect(row.count).toBe(10)
      expect(row.p50).toBeGreaterThan(0)
      expect(row.p90).toBeGreaterThanOrEqual(row.p50)
      expect(row.p99).toBeGreaterThanOrEqual(row.p90)
      expect(row.avg).toBeGreaterThan(0)
    })

    it('should exclude non-completed sessions', () => {
      const s = sessionsRepository.create({ project_id: TEST_PROJECT_ID, agent_id: TEST_AGENT_ID })
      db.prepare(
        `UPDATE sessions SET started_at = datetime('now', '-60 seconds') WHERE id = ?`
      ).run(s.id)

      const result = analyticsRepository.durationPercentiles(TEST_PROJECT_ID, 365)
      expect(result).toHaveLength(0)
    })

    it('should only include sessions for the given project', () => {
      const otherProjectId = 'other-project'
      db.prepare(
        `INSERT INTO projects (id, name, owner_id) VALUES (?, 'Other', ?)`
      ).run(otherProjectId, TEST_USER_ID)

      const s = sessionsRepository.create({ project_id: otherProjectId, agent_id: TEST_AGENT_ID })
      db.prepare(
        `UPDATE sessions SET status = 'completed',
           started_at = datetime('now', '-60 seconds'),
           completed_at = datetime('now')
         WHERE id = ?`
      ).run(s.id)

      const result = analyticsRepository.durationPercentiles(TEST_PROJECT_ID, 365)
      expect(result).toHaveLength(0)
    })

    it('should respect the days parameter', () => {
      const s = sessionsRepository.create({ project_id: TEST_PROJECT_ID, agent_id: TEST_AGENT_ID })
      db.prepare(
        `UPDATE sessions SET status = 'completed',
           started_at = date('now', '-60 days'),
           completed_at = date('now', '-59 days')
         WHERE id = ?`
      ).run(s.id)

      expect(analyticsRepository.durationPercentiles(TEST_PROJECT_ID, 30)).toHaveLength(0)
      expect(analyticsRepository.durationPercentiles(TEST_PROJECT_ID, 90)).toHaveLength(1)
    })
  })

  describe('pipelineStageDuration', () => {
    let triggerId: number

    beforeEach(() => {
      db.prepare(
        `INSERT INTO agents (id, system_prompt, is_enabled) VALUES (?, 'test prompt', 1)`
      ).run(TEST_AGENT_ID)

      const result = db.prepare(
        `INSERT INTO agent_triggers (agent_id, event_type, project_id, is_enabled)
         VALUES (?, 'comment.created', ?, 1)`
      ).run(TEST_AGENT_ID, TEST_PROJECT_ID)
      triggerId = Number(result.lastInsertRowid)
    })

    it('should return empty array when no completed invocations exist', () => {
      const result = analyticsRepository.pipelineStageDuration(TEST_PROJECT_ID)
      expect(result).toHaveLength(0)
    })

    it('should compute duration stats for completed invocations', () => {
      for (let i = 1; i <= 5; i++) {
        db.prepare(
          `INSERT INTO agent_invocations
             (agent_id, trigger_id, project_id, status, context,
              started_at, completed_at)
           VALUES (?, ?, ?, 'completed', '{}',
             datetime('now', '-${i * 100} seconds'), datetime('now'))`
        ).run(TEST_AGENT_ID, triggerId, TEST_PROJECT_ID)
      }

      const result = analyticsRepository.pipelineStageDuration(TEST_PROJECT_ID, 365)

      expect(result).toHaveLength(1)
      const row = result[0]!
      expect(row.agent_id).toBe(TEST_AGENT_ID)
      expect(row.agent_name).toBe('Test Agent')
      expect(row.count).toBe(5)
      expect(row.avg_duration).toBeGreaterThan(0)
      expect(row.p50).toBeGreaterThan(0)
      expect(row.p90).toBeGreaterThanOrEqual(row.p50)
    })

    it('should exclude non-completed invocations', () => {
      db.prepare(
        `INSERT INTO agent_invocations
           (agent_id, trigger_id, project_id, status, context, started_at)
         VALUES (?, ?, ?, 'running', '{}', datetime('now', '-60 seconds'))`
      ).run(TEST_AGENT_ID, triggerId, TEST_PROJECT_ID)

      const result = analyticsRepository.pipelineStageDuration(TEST_PROJECT_ID, 365)
      expect(result).toHaveLength(0)
    })

    it('should only include invocations for the given project', () => {
      const otherProjectId = 'other-project'
      db.prepare(
        `INSERT INTO projects (id, name, owner_id) VALUES (?, 'Other', ?)`
      ).run(otherProjectId, TEST_USER_ID)

      db.prepare(
        `INSERT INTO agent_invocations
           (agent_id, trigger_id, project_id, status, context,
            started_at, completed_at)
         VALUES (?, ?, ?, 'completed', '{}',
           datetime('now', '-60 seconds'), datetime('now'))`
      ).run(TEST_AGENT_ID, triggerId, otherProjectId)

      const result = analyticsRepository.pipelineStageDuration(TEST_PROJECT_ID, 365)
      expect(result).toHaveLength(0)
    })

    it('should respect the days parameter', () => {
      db.prepare(
        `INSERT INTO agent_invocations
           (agent_id, trigger_id, project_id, status, context,
            started_at, completed_at)
         VALUES (?, ?, ?, 'completed', '{}',
           date('now', '-60 days'), date('now', '-59 days'))`
      ).run(TEST_AGENT_ID, triggerId, TEST_PROJECT_ID)

      expect(analyticsRepository.pipelineStageDuration(TEST_PROJECT_ID, 30)).toHaveLength(0)
      expect(analyticsRepository.pipelineStageDuration(TEST_PROJECT_ID, 90)).toHaveLength(1)
    })
  })
})
