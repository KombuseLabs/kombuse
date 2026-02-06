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
  'status',
  'priority',
  'claimed_at',
  'claim_expires_at',
  'external_source',
  'external_id',
  'external_url',
  'synced_at',
  'created_at',
  'updated_at',
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
  '001_initial_schema',
  '002_invocation_kombuse_session_id',
  '003_session_ticket_id',
  '004_comment_kombuse_session_id',
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
