import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'
import { runMigrations, setDatabase } from './database'

// Default test IDs for profiles and projects
export const TEST_USER_ID = 'test-user-1'
export const TEST_AGENT_ID = 'test-agent-1'
export const TEST_PROJECT_ID = 'test-project-1'
export const TEST_PROJECT_2_ID = 'test-project-2'

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
 * Seed a second project for cross-project isolation tests.
 * Requires seedBaseData() to have been called first (for TEST_USER_ID profile).
 */
export function seedSecondProject(db: DatabaseType): void {
  db.prepare(`
    INSERT INTO projects (id, name, owner_id)
    VALUES (?, 'Second Project', ?)
  `).run(TEST_PROJECT_2_ID, TEST_USER_ID)
}

/**
 * Seed a complete second-project fixture for cross-project isolation tests.
 * Creates project-2 with 2 tickets, 1 label, and 1 agent.
 * Requires seedBaseData() to have been called first.
 */
export function seedMultiProjectData(db: DatabaseType): void {
  seedSecondProject(db)

  // Create tickets in project-2
  db.prepare(`
    INSERT INTO tickets (project_id, author_id, title, status)
    VALUES (?, ?, 'Project 2 ticket A', 'open')
  `).run(TEST_PROJECT_2_ID, TEST_USER_ID)
  db.prepare(`
    INSERT INTO tickets (project_id, author_id, title, status)
    VALUES (?, ?, 'Project 2 ticket B', 'closed')
  `).run(TEST_PROJECT_2_ID, TEST_USER_ID)

  // Create a label in project-2
  db.prepare(`
    INSERT INTO labels (project_id, name, color)
    VALUES (?, 'Project 2 Label', '#ff0000')
  `).run(TEST_PROJECT_2_ID)

  // Create an agent profile and agent scoped to project-2
  const agentId = 'test-agent-project-2'
  db.prepare(`
    INSERT INTO profiles (id, type, name)
    VALUES (?, 'agent', 'Project 2 Agent')
  `).run(agentId)
  db.prepare(`
    INSERT INTO agents (id, system_prompt, project_id, slug)
    VALUES (?, 'You are a test agent', ?, 'project-2-agent')
  `).run(agentId, TEST_PROJECT_2_ID)
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
