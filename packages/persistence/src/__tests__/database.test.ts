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
const EXPECTED_TABLES = ['migrations', 'tickets', 'ticket_activities']
const EXPECTED_TICKET_COLUMNS = [
  'id',
  'title',
  'body',
  'status',
  'priority',
  'project_id',
  'github_id',
  'repo_name',
  'created_at',
  'updated_at',
]
const EXPECTED_INDEXES = ['idx_tickets_status', 'idx_tickets_project_id']
const EXPECTED_MIGRATIONS = [
  '001_create_tickets',
  '002_create_ticket_activities',
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

    // Edge case: Verify foreign key constraints are set up correctly
    it('should create ticket_activities with foreign key to tickets', () => {
      runMigrations(db)

      const foreignKeys = db
        .prepare('PRAGMA foreign_key_list(ticket_activities)')
        .all() as { table: string; from: string; to: string }[]

      expect(foreignKeys).toHaveLength(1)
      expect(foreignKeys[0]).toMatchObject({
        table: 'tickets',
        from: 'ticket_id',
        to: 'id',
      })
    })
  })
})
