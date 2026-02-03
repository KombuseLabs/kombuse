import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'
import { runMigrations, setDatabase } from './database'

// Default test IDs for profiles and projects
export const TEST_USER_ID = 'test-user-1'
export const TEST_AGENT_ID = 'test-agent-1'
export const TEST_PROJECT_ID = 'test-project-1'

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

/**
 * Seed the required base data (profile + project) for ticket tests
 */
export function seedBaseData(db: DatabaseType): void {
  // Create a test user
  db.prepare(`
    INSERT INTO profiles (id, type, name, email)
    VALUES (?, 'user', 'Test User', 'test@example.com')
  `).run(TEST_USER_ID)

  // Create a test agent
  db.prepare(`
    INSERT INTO profiles (id, type, name)
    VALUES (?, 'agent', 'Test Agent')
  `).run(TEST_AGENT_ID)

  // Create a test project
  db.prepare(`
    INSERT INTO projects (id, name, owner_id)
    VALUES (?, 'Test Project', ?)
  `).run(TEST_PROJECT_ID, TEST_USER_ID)
}

function seedTestData(db: DatabaseType) {
  seedBaseData(db)

  // Create sample tickets
  db.exec(`
    INSERT INTO tickets (project_id, author_id, title, status) VALUES
    ('${TEST_PROJECT_ID}', '${TEST_USER_ID}', 'Open ticket', 'open'),
    ('${TEST_PROJECT_ID}', '${TEST_USER_ID}', 'Closed ticket', 'closed'),
    ('${TEST_PROJECT_ID}', '${TEST_USER_ID}', 'In progress ticket', 'in_progress')
  `)
}

/**
 * Setup test database and return cleanup function.
 * Use with beforeEach/afterEach.
 */
export function setupTestDb(): { db: DatabaseType; cleanup: () => void } {
  const db = createTestDatabase()
  seedBaseData(db)
  setDatabase(db)
  return { db, cleanup: () => db.close() }
}
