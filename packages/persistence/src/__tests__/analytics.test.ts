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

    it('should return valid percentiles for a single completed session (not NULL)', () => {
      const s = sessionsRepository.create({ project_id: TEST_PROJECT_ID, agent_id: TEST_AGENT_ID })
      db.prepare(
        `UPDATE sessions SET status = 'completed',
           started_at = datetime('now', '-120 seconds'),
           completed_at = datetime('now')
         WHERE id = ?`
      ).run(s.id)

      const result = analyticsRepository.durationPercentiles(TEST_PROJECT_ID, 365)

      expect(result).toHaveLength(1)
      const row = result[0]!
      expect(row.count).toBe(1)
      expect(row.avg, 'avg should not be null').not.toBeNull()
      expect(row.p50, 'p50 should not be null').not.toBeNull()
      expect(row.p90, 'p90 should not be null').not.toBeNull()
      expect(row.p99, 'p99 should not be null').not.toBeNull()
      expect(row.p50).toBeGreaterThan(0)
      expect(row.p90).toBeGreaterThan(0)
      expect(row.p99).toBeGreaterThan(0)
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

    it('should return valid percentiles for a single completed invocation (not NULL)', () => {
      db.prepare(
        `INSERT INTO agent_invocations
           (agent_id, trigger_id, project_id, status, context,
            started_at, completed_at)
         VALUES (?, ?, ?, 'completed', '{}',
           datetime('now', '-120 seconds'), datetime('now'))`
      ).run(TEST_AGENT_ID, triggerId, TEST_PROJECT_ID)

      const result = analyticsRepository.pipelineStageDuration(TEST_PROJECT_ID, 365)

      expect(result).toHaveLength(1)
      const row = result[0]!
      expect(row.count).toBe(1)
      expect(row.avg_duration, 'avg_duration should not be null').not.toBeNull()
      expect(row.p50, 'p50 should not be null').not.toBeNull()
      expect(row.p90, 'p90 should not be null').not.toBeNull()
      expect(row.p50).toBeGreaterThan(0)
      expect(row.p90).toBeGreaterThan(0)
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

  describe('mostFrequentReads', () => {
    it('should return empty array when no read events exist', () => {
      const result = analyticsRepository.mostFrequentReads(TEST_PROJECT_ID)
      expect(result).toHaveLength(0)
    })

    it('should count reads grouped by file path', () => {
      const session = sessionsRepository.create({ project_id: TEST_PROJECT_ID })

      // Insert tool_use events for Read tool
      for (let i = 0; i < 3; i++) {
        db.prepare(
          `INSERT INTO session_events (session_id, seq, event_type, payload)
           VALUES (?, ?, 'tool_use', ?)`
        ).run(session.id, i + 1, JSON.stringify({
          name: 'Read',
          id: `read-${i}`,
          input: { file_path: '/src/index.ts' },
        }))
      }
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, ?, 'tool_use', ?)`
      ).run(session.id, 4, JSON.stringify({
        name: 'Read',
        id: 'read-other',
        input: { file_path: '/src/utils.ts' },
      }))

      const result = analyticsRepository.mostFrequentReads(TEST_PROJECT_ID, 365)

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ file_path: '/src/index.ts', read_count: 3 })
      expect(result[1]).toMatchObject({ file_path: '/src/utils.ts', read_count: 1 })
    })

    it('should only include reads for the given project', () => {
      const otherProjectId = 'other-project'
      db.prepare(
        `INSERT INTO projects (id, name, owner_id) VALUES (?, 'Other', ?)`
      ).run(otherProjectId, TEST_USER_ID)

      const s1 = sessionsRepository.create({ project_id: TEST_PROJECT_ID })
      const s2 = sessionsRepository.create({ project_id: otherProjectId })

      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 1, 'tool_use', ?)`
      ).run(s1.id, JSON.stringify({ name: 'Read', id: 'r1', input: { file_path: '/a.ts' } }))
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 1, 'tool_use', ?)`
      ).run(s2.id, JSON.stringify({ name: 'Read', id: 'r2', input: { file_path: '/b.ts' } }))

      const result = analyticsRepository.mostFrequentReads(TEST_PROJECT_ID, 365)
      expect(result).toHaveLength(1)
      expect(result[0]!.file_path).toBe('/a.ts')
    })

    it('should respect the days parameter', () => {
      const session = sessionsRepository.create({ project_id: TEST_PROJECT_ID })
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload, created_at)
         VALUES (?, 1, 'tool_use', ?, date('now', '-60 days'))`
      ).run(session.id, JSON.stringify({ name: 'Read', id: 'r1', input: { file_path: '/old.ts' } }))

      expect(analyticsRepository.mostFrequentReads(TEST_PROJECT_ID, 30)).toHaveLength(0)
      expect(analyticsRepository.mostFrequentReads(TEST_PROJECT_ID, 90)).toHaveLength(1)
    })

    it('should respect the limit parameter', () => {
      const session = sessionsRepository.create({ project_id: TEST_PROJECT_ID })
      for (let i = 0; i < 5; i++) {
        db.prepare(
          `INSERT INTO session_events (session_id, seq, event_type, payload)
           VALUES (?, ?, 'tool_use', ?)`
        ).run(session.id, i + 1, JSON.stringify({
          name: 'Read',
          id: `r-${i}`,
          input: { file_path: `/file-${i}.ts` },
        }))
      }

      const result = analyticsRepository.mostFrequentReads(TEST_PROJECT_ID, 365, 3)
      expect(result).toHaveLength(3)
    })
  })

  describe('toolCallsPerSession', () => {
    beforeEach(() => {
      db.prepare(
        `INSERT INTO agents (id, system_prompt, is_enabled) VALUES (?, 'test prompt', 1)`
      ).run(TEST_AGENT_ID)
    })

    it('should return empty array when no tool calls exist', () => {
      const result = analyticsRepository.toolCallsPerSession(TEST_PROJECT_ID)
      expect(result).toHaveLength(0)
    })

    it('should count tool calls grouped by session', () => {
      const s1 = sessionsRepository.create({ project_id: TEST_PROJECT_ID, agent_id: TEST_AGENT_ID })
      const s2 = sessionsRepository.create({ project_id: TEST_PROJECT_ID, agent_id: TEST_AGENT_ID })

      for (let i = 0; i < 3; i++) {
        db.prepare(
          `INSERT INTO session_events (session_id, seq, event_type, payload)
           VALUES (?, ?, 'tool_use', ?)`
        ).run(s1.id, i + 1, JSON.stringify({ name: 'Bash', id: `t-${i}` }))
      }
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 1, 'tool_use', ?)`
      ).run(s2.id, JSON.stringify({ name: 'Read', id: 't-x' }))

      const result = analyticsRepository.toolCallsPerSession(TEST_PROJECT_ID, 365)

      expect(result).toHaveLength(2)
      expect(result[0]!.call_count).toBe(3)
      expect(result[0]!.agent_name).toBe('Test Agent')
      expect(result[1]!.call_count).toBe(1)
    })

    it('should only include calls for the given project', () => {
      const otherProjectId = 'other-project'
      db.prepare(
        `INSERT INTO projects (id, name, owner_id) VALUES (?, 'Other', ?)`
      ).run(otherProjectId, TEST_USER_ID)

      const s1 = sessionsRepository.create({ project_id: TEST_PROJECT_ID, agent_id: TEST_AGENT_ID })
      const s2 = sessionsRepository.create({ project_id: otherProjectId, agent_id: TEST_AGENT_ID })

      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 1, 'tool_use', ?)`
      ).run(s1.id, JSON.stringify({ name: 'Read', id: 't1' }))
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 1, 'tool_use', ?)`
      ).run(s2.id, JSON.stringify({ name: 'Read', id: 't2' }))

      const result = analyticsRepository.toolCallsPerSession(TEST_PROJECT_ID, 365)
      expect(result).toHaveLength(1)
    })

    it('should filter by agent_id when provided', () => {
      const otherAgentId = 'other-agent'
      db.prepare(
        `INSERT INTO profiles (id, type, name) VALUES (?, 'agent', 'Other Agent')`
      ).run(otherAgentId)
      db.prepare(
        `INSERT INTO agents (id, system_prompt, is_enabled) VALUES (?, 'test', 1)`
      ).run(otherAgentId)

      const s1 = sessionsRepository.create({ project_id: TEST_PROJECT_ID, agent_id: TEST_AGENT_ID })
      const s2 = sessionsRepository.create({ project_id: TEST_PROJECT_ID, agent_id: otherAgentId })

      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 1, 'tool_use', ?)`
      ).run(s1.id, JSON.stringify({ name: 'Read', id: 't1' }))
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 1, 'tool_use', ?)`
      ).run(s2.id, JSON.stringify({ name: 'Read', id: 't2' }))

      const all = analyticsRepository.toolCallsPerSession(TEST_PROJECT_ID, 365)
      expect(all).toHaveLength(2)

      const filtered = analyticsRepository.toolCallsPerSession(TEST_PROJECT_ID, 365, TEST_AGENT_ID)
      expect(filtered).toHaveLength(1)
      expect(filtered[0]!.agent_id).toBe(TEST_AGENT_ID)
    })

    it('should respect the days parameter', () => {
      const session = sessionsRepository.create({ project_id: TEST_PROJECT_ID, agent_id: TEST_AGENT_ID })
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload, created_at)
         VALUES (?, 1, 'tool_use', ?, date('now', '-60 days'))`
      ).run(session.id, JSON.stringify({ name: 'Read', id: 'old' }))

      expect(analyticsRepository.toolCallsPerSession(TEST_PROJECT_ID, 30)).toHaveLength(0)
      expect(analyticsRepository.toolCallsPerSession(TEST_PROJECT_ID, 90)).toHaveLength(1)
    })
  })

  describe('slowestTools', () => {
    it('should return empty array when no tool calls exist', () => {
      const result = analyticsRepository.slowestTools(TEST_PROJECT_ID)
      expect(result).toHaveLength(0)
    })

    it('should compute percentiles for tools with matching results', () => {
      const session = sessionsRepository.create({ project_id: TEST_PROJECT_ID })

      for (let i = 0; i < 5; i++) {
        const toolUseId = `tu-${i}`
        const baseTs = 1000000 + i * 10000
        db.prepare(
          `INSERT INTO session_events (session_id, seq, event_type, payload)
           VALUES (?, ?, 'tool_use', ?)`
        ).run(session.id, i * 2 + 1, JSON.stringify({
          name: 'Bash',
          id: toolUseId,
          timestamp: baseTs,
        }))
        db.prepare(
          `INSERT INTO session_events (session_id, seq, event_type, payload)
           VALUES (?, ?, 'tool_result', ?)`
        ).run(session.id, i * 2 + 2, JSON.stringify({
          toolUseId,
          timestamp: baseTs + 500 + i * 100,
        }))
      }

      const result = analyticsRepository.slowestTools(TEST_PROJECT_ID, 365)

      expect(result).toHaveLength(1)
      const row = result[0]!
      expect(row.tool_name).toBe('Bash')
      expect(row.count).toBe(5)
      expect(row.avg).toBeGreaterThan(0)
      expect(row.p50).toBeGreaterThan(0)
      expect(row.p90).toBeGreaterThanOrEqual(row.p50)
      expect(row.p99).toBeGreaterThanOrEqual(row.p90)
    })

    it('should return valid percentiles for a single tool call (not NULL)', () => {
      const session = sessionsRepository.create({ project_id: TEST_PROJECT_ID })

      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 1, 'tool_use', ?)`
      ).run(session.id, JSON.stringify({ name: 'Bash', id: 'single-tu', timestamp: 1000 }))
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 2, 'tool_result', ?)`
      ).run(session.id, JSON.stringify({ toolUseId: 'single-tu', timestamp: 1500 }))

      const result = analyticsRepository.slowestTools(TEST_PROJECT_ID, 365)

      expect(result).toHaveLength(1)
      const row = result[0]!
      expect(row.count).toBe(1)
      expect(row.avg).not.toBeNull()
      expect(row.p50).not.toBeNull()
      expect(row.p90).not.toBeNull()
      expect(row.p99).not.toBeNull()
      expect(row.p50).toBe(row.avg)
      expect(row.p90).toBe(row.avg)
      expect(row.p99).toBe(row.avg)
    })

    it('should exclude tool_use events without matching tool_result', () => {
      const session = sessionsRepository.create({ project_id: TEST_PROJECT_ID })

      // tool_use with matching result
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 1, 'tool_use', ?)`
      ).run(session.id, JSON.stringify({ name: 'Read', id: 'matched', timestamp: 1000 }))
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 2, 'tool_result', ?)`
      ).run(session.id, JSON.stringify({ toolUseId: 'matched', timestamp: 2000 }))

      // tool_use without result (aborted)
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 3, 'tool_use', ?)`
      ).run(session.id, JSON.stringify({ name: 'Read', id: 'orphan', timestamp: 3000 }))

      const result = analyticsRepository.slowestTools(TEST_PROJECT_ID, 365)
      expect(result).toHaveLength(1)
      expect(result[0]!.count).toBe(1)
    })

    it('should only include calls for the given project', () => {
      const otherProjectId = 'other-project'
      db.prepare(
        `INSERT INTO projects (id, name, owner_id) VALUES (?, 'Other', ?)`
      ).run(otherProjectId, TEST_USER_ID)

      const session = sessionsRepository.create({ project_id: otherProjectId })
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 1, 'tool_use', ?)`
      ).run(session.id, JSON.stringify({ name: 'Bash', id: 'tu1', timestamp: 1000 }))
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 2, 'tool_result', ?)`
      ).run(session.id, JSON.stringify({ toolUseId: 'tu1', timestamp: 2000 }))

      const result = analyticsRepository.slowestTools(TEST_PROJECT_ID, 365)
      expect(result).toHaveLength(0)
    })

    it('should respect the days parameter', () => {
      const session = sessionsRepository.create({ project_id: TEST_PROJECT_ID })
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload, created_at)
         VALUES (?, 1, 'tool_use', ?, date('now', '-60 days'))`
      ).run(session.id, JSON.stringify({ name: 'Bash', id: 'old', timestamp: 1000 }))
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload, created_at)
         VALUES (?, 2, 'tool_result', ?, date('now', '-60 days'))`
      ).run(session.id, JSON.stringify({ toolUseId: 'old', timestamp: 2000 }))

      expect(analyticsRepository.slowestTools(TEST_PROJECT_ID, 30)).toHaveLength(0)
      expect(analyticsRepository.slowestTools(TEST_PROJECT_ID, 90)).toHaveLength(1)
    })
  })

  describe('toolCallVolume', () => {
    it('should return empty array when no tool calls exist', () => {
      const result = analyticsRepository.toolCallVolume(TEST_PROJECT_ID)
      expect(result).toHaveLength(0)
    })

    it('should count calls grouped by tool name', () => {
      const s1 = sessionsRepository.create({ project_id: TEST_PROJECT_ID })
      const s2 = sessionsRepository.create({ project_id: TEST_PROJECT_ID })

      // 3 Bash calls across 2 sessions
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 1, 'tool_use', ?)`
      ).run(s1.id, JSON.stringify({ name: 'Bash', id: 'b1' }))
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 2, 'tool_use', ?)`
      ).run(s1.id, JSON.stringify({ name: 'Bash', id: 'b2' }))
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 1, 'tool_use', ?)`
      ).run(s2.id, JSON.stringify({ name: 'Bash', id: 'b3' }))

      // 1 Read call in 1 session
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 3, 'tool_use', ?)`
      ).run(s1.id, JSON.stringify({ name: 'Read', id: 'r1' }))

      const result = analyticsRepository.toolCallVolume(TEST_PROJECT_ID, 365)

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ tool_name: 'Bash', call_count: 3, session_count: 2 })
      expect(result[1]).toMatchObject({ tool_name: 'Read', call_count: 1, session_count: 1 })
    })

    it('should only include calls for the given project', () => {
      const otherProjectId = 'other-project'
      db.prepare(
        `INSERT INTO projects (id, name, owner_id) VALUES (?, 'Other', ?)`
      ).run(otherProjectId, TEST_USER_ID)

      const s1 = sessionsRepository.create({ project_id: TEST_PROJECT_ID })
      const s2 = sessionsRepository.create({ project_id: otherProjectId })

      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 1, 'tool_use', ?)`
      ).run(s1.id, JSON.stringify({ name: 'Read', id: 't1' }))
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload)
         VALUES (?, 1, 'tool_use', ?)`
      ).run(s2.id, JSON.stringify({ name: 'Read', id: 't2' }))

      const result = analyticsRepository.toolCallVolume(TEST_PROJECT_ID, 365)
      expect(result).toHaveLength(1)
      expect(result[0]!.call_count).toBe(1)
    })

    it('should respect the days parameter', () => {
      const session = sessionsRepository.create({ project_id: TEST_PROJECT_ID })
      db.prepare(
        `INSERT INTO session_events (session_id, seq, event_type, payload, created_at)
         VALUES (?, 1, 'tool_use', ?, date('now', '-60 days'))`
      ).run(session.id, JSON.stringify({ name: 'Read', id: 'old' }))

      expect(analyticsRepository.toolCallVolume(TEST_PROJECT_ID, 30)).toHaveLength(0)
      expect(analyticsRepository.toolCallVolume(TEST_PROJECT_ID, 90)).toHaveLength(1)
    })
  })

  describe('ticketBurndown', () => {
    // Note: beforeEach creates one "Test ticket for analytics" in TEST_PROJECT_ID.
    // We account for that base ticket in assertions.

    it('should return a date series for each day in range', () => {
      const result = analyticsRepository.ticketBurndown(TEST_PROJECT_ID, 7)
      expect(result).toHaveLength(8) // today + 7 prior days
    })

    it('should count open tickets for each day', () => {
      const ticket = ticketsRepository.create({
        title: 'Open ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      db.prepare("UPDATE tickets SET created_at = date('now', '-5 days') WHERE id = ?").run(ticket.id)

      const result = analyticsRepository.ticketBurndown(TEST_PROJECT_ID, 7)

      // Today should show both the base ticket and the new one as open
      const today = result[result.length - 1]!
      expect(today.total).toBe(2)
      expect(today.open).toBe(2)
      expect(today.closed).toBe(0)
    })

    it('should track closed tickets correctly', () => {
      const ticket = ticketsRepository.create({
        title: 'Closed ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      db.prepare(
        "UPDATE tickets SET created_at = date('now', '-10 days'), closed_at = date('now', '-3 days'), status = 'closed' WHERE id = ?"
      ).run(ticket.id)

      const result = analyticsRepository.ticketBurndown(TEST_PROJECT_ID, 14)

      // Today: base ticket is open, closed ticket is closed
      const today = result[result.length - 1]!
      expect(today.total).toBe(2)
      expect(today.open).toBe(1)
      expect(today.closed).toBe(1)
    })

    it('should filter by project_id', () => {
      const otherProjectId = 'other-project'
      db.prepare(
        `INSERT INTO projects (id, name, owner_id) VALUES (?, 'Other', ?)`
      ).run(otherProjectId, TEST_USER_ID)

      ticketsRepository.create({
        title: 'Other project ticket',
        project_id: otherProjectId,
        author_id: TEST_USER_ID,
      })

      // Other project should have exactly 1 ticket
      const result = analyticsRepository.ticketBurndown(otherProjectId, 7)
      const today = result[result.length - 1]!
      expect(today.total).toBe(1)
    })

    it('should filter by milestone_id', () => {
      db.prepare(
        `INSERT INTO milestones (project_id, title) VALUES (?, 'M1')`
      ).run(TEST_PROJECT_ID)
      const milestoneId = (db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number }).id

      const t1 = ticketsRepository.create({
        title: 'T1',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      db.prepare('UPDATE tickets SET milestone_id = ? WHERE id = ?').run(milestoneId, t1.id)

      const filtered = analyticsRepository.ticketBurndown(TEST_PROJECT_ID, 7, milestoneId)
      const unfiltered = analyticsRepository.ticketBurndown(TEST_PROJECT_ID, 7)

      expect(filtered[filtered.length - 1]!.total).toBe(1)
      // Unfiltered includes base ticket + t1
      expect(unfiltered[unfiltered.length - 1]!.total).toBe(2)
    })

    it('should filter by label_id', () => {
      db.prepare(
        `INSERT INTO labels (project_id, name, color) VALUES (?, 'Bug', '#ff0000')`
      ).run(TEST_PROJECT_ID)
      const labelId = (db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number }).id

      const t1 = ticketsRepository.create({
        title: 'T1',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      db.prepare('INSERT INTO ticket_labels (ticket_id, label_id) VALUES (?, ?)').run(t1.id, labelId)

      const filtered = analyticsRepository.ticketBurndown(TEST_PROJECT_ID, 7, undefined, labelId)
      expect(filtered[filtered.length - 1]!.total).toBe(1)
    })

    it('should respect the days parameter', () => {
      const result7 = analyticsRepository.ticketBurndown(TEST_PROJECT_ID, 7)
      const result30 = analyticsRepository.ticketBurndown(TEST_PROJECT_ID, 30)
      expect(result7).toHaveLength(8)
      expect(result30).toHaveLength(31)
    })

    it('should return dates sorted ascending', () => {
      const result = analyticsRepository.ticketBurndown(TEST_PROJECT_ID, 7)
      for (let i = 1; i < result.length; i++) {
        expect(result[i]!.date > result[i - 1]!.date).toBe(true)
      }
    })
  })
})
