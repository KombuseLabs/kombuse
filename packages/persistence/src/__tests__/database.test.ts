/**
 * @fileoverview Tests for database initialization and migrations
 *
 * Run: bun run --filter @kombuse/persistence test -- src/__tests__/database.test.ts
 *
 * Tests verify:
 * - Migration system creates required tables
 * - Schema matches expected columns and indexes
 * - Migrations are idempotent (safe to run multiple times)
 * - Migration tracking prevents duplicate runs
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../database'

// Expected schema - update when adding migrations
const EXPECTED_TABLES = [
  'migrations',
  'profiles',
  'profile_settings',
  'projects',
  'labels',
  'tickets',
  'ticket_labels',
  'comments',
  'mentions',
  'attachments',
  'events',
  'event_subscriptions',
  'sessions',
  'session_events',
  'agents',
  'agent_triggers',
  'agent_invocations',
]
const EXPECTED_TICKET_COLUMNS = [
  'id',
  'project_id',
  'author_id',
  'assignee_id',
  'claimed_by_id',
  'title',
  'body',
  'triggers_enabled',
  'loop_protection_enabled',
  'status',
  'priority',
  'claimed_at',
  'claim_expires_at',
  'milestone_id',
  'external_source',
  'external_id',
  'external_url',
  'synced_at',
  'opened_at',
  'closed_at',
  'last_activity_at',
  'created_at',
  'updated_at',
]
const EXPECTED_SESSION_COLUMNS = [
  'id',
  'kombuse_session_id',
  'backend_type',
  'backend_session_id',
  'ticket_id',
  'project_id',
  'agent_id',
  'status',
  'metadata',
  'started_at',
  'completed_at',
  'failed_at',
  'aborted_at',
  'last_event_seq',
  'created_at',
  'updated_at',
]
const EXPECTED_INVOCATION_COLUMNS = [
  'id',
  'agent_id',
  'trigger_id',
  'event_id',
  'session_id',
  'project_id',
  'status',
  'attempts',
  'max_attempts',
  'run_at',
  'context',
  'result',
  'error',
  'started_at',
  'completed_at',
  'created_at',
  'kombuse_session_id',
]
const EXPECTED_INDEXES = [
  'idx_tickets_project',
  'idx_tickets_status',
  'idx_tickets_author',
  'idx_tickets_claimed',
  'idx_tickets_assignee',
  'idx_tickets_claimed_by',
]
const EXPECTED_MIGRATIONS = [
  '001_schema',
  '002_profiles_slug',
  '003_agents_plugin_base',
  '004_plugin_scoped_slugs',
  '005_trigger_slugs',
  '006_agents_project_id',
]

describe('database', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  describe('runMigrations', () => {
    it('should create all required tables', () => {
      runMigrations(db)

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[]
      const tableNames = tables.map((t) => t.name)

      for (const expected of EXPECTED_TABLES) {
        expect(tableNames, `Missing table: ${expected}`).toContain(expected)
      }
    })

    it('should create tickets table with all required columns', () => {
      runMigrations(db)

      const columns = db
        .prepare('PRAGMA table_info(tickets)')
        .all() as { name: string }[]
      const columnNames = columns.map((c) => c.name)

      for (const expected of EXPECTED_TICKET_COLUMNS) {
        expect(columnNames, `Missing column: tickets.${expected}`).toContain(
          expected
        )
      }
    })

    it('should create sessions table with all required columns', () => {
      runMigrations(db)

      const columns = db
        .prepare('PRAGMA table_info(sessions)')
        .all() as { name: string }[]
      const columnNames = columns.map((c) => c.name)

      for (const expected of EXPECTED_SESSION_COLUMNS) {
        expect(columnNames, `Missing column: sessions.${expected}`).toContain(
          expected
        )
      }
    })

    it('should create agent_invocations table with all required columns', () => {
      runMigrations(db)

      const columns = db
        .prepare('PRAGMA table_info(agent_invocations)')
        .all() as { name: string }[]
      const columnNames = columns.map((c) => c.name)

      for (const expected of EXPECTED_INVOCATION_COLUMNS) {
        expect(columnNames, `Missing column: agent_invocations.${expected}`).toContain(
          expected
        )
      }
    })

    it('should create required indexes for query performance', () => {
      runMigrations(db)

      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='tickets'"
        )
        .all() as { name: string }[]
      const indexNames = indexes.map((i) => i.name)

      for (const expected of EXPECTED_INDEXES) {
        expect(indexNames, `Missing index: ${expected}`).toContain(expected)
      }
    })

    it('should track all applied migrations', () => {
      runMigrations(db)

      const migrations = db
        .prepare('SELECT name FROM migrations ORDER BY id')
        .all() as { name: string }[]
      const migrationNames = migrations.map((m) => m.name)

      expect(migrationNames).toEqual(EXPECTED_MIGRATIONS)
    })

    // Edge case: Ensures migrations can be run on existing database without errors
    it('should be idempotent - running twice does not error or duplicate', () => {
      runMigrations(db)
      expect(() => runMigrations(db)).not.toThrow()

      // Verify no duplicate migrations
      const migrations = db
        .prepare('SELECT name FROM migrations')
        .all() as { name: string }[]
      expect(migrations).toHaveLength(EXPECTED_MIGRATIONS.length)
    })

    // Verify foreign key constraints are set up correctly on tickets
    it('should create tickets with foreign key to projects', () => {
      runMigrations(db)

      const foreignKeys = db
        .prepare('PRAGMA foreign_key_list(tickets)')
        .all() as { table: string; from: string; to: string }[]

      // tickets has FKs to: projects (project_id), profiles (author_id, assignee_id, claimed_by_id)
      expect(foreignKeys.length).toBeGreaterThanOrEqual(2)

      const projectFK = foreignKeys.find((fk) => fk.from === 'project_id')
      expect(projectFK).toMatchObject({
        table: 'projects',
        from: 'project_id',
        to: 'id',
      })
    })

    // Verify comments table has correct foreign keys
    it('should create comments with foreign keys to tickets and profiles', () => {
      runMigrations(db)

      const foreignKeys = db
        .prepare('PRAGMA foreign_key_list(comments)')
        .all() as { table: string; from: string; to: string }[]

      // comments has FKs to: tickets (ticket_id), profiles (author_id), comments (parent_id)
      expect(foreignKeys.length).toBeGreaterThanOrEqual(2)

      const ticketFK = foreignKeys.find((fk) => fk.from === 'ticket_id')
      expect(ticketFK).toMatchObject({
        table: 'tickets',
        from: 'ticket_id',
        to: 'id',
      })
    })

  })
})
