import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'
import { runMigrations, setDatabase } from './database'

/**
 * Create an in-memory test database with migrations applied
 */
export function createTestDatabase(): DatabaseType {
  const db = new Database(':memory:')
  runMigrations(db)
  return db
}

/**
 * Create an in-memory database with sample test data
 */
export function createSeededDatabase(): DatabaseType {
  const db = createTestDatabase()
  seedTestData(db)
  return db
}

function seedTestData(db: DatabaseType) {
  db.exec(`
    INSERT INTO tickets (title, status) VALUES
    ('Open ticket', 'open'),
    ('Closed ticket', 'closed'),
    ('In progress ticket', 'in_progress')
  `)
}

/**
 * Setup test database and return cleanup function.
 * Use with beforeEach/afterEach.
 */
export function setupTestDb(): { db: DatabaseType; cleanup: () => void } {
  const db = createTestDatabase()
  setDatabase(db)
  return { db, cleanup: () => db.close() }
}
