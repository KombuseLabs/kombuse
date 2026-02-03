import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

export type { Database as DatabaseType } from 'better-sqlite3'

let db: DatabaseType | null = null

/**
 * Set the database instance (dependency injection).
 * Call this before any database operations to inject an external db.
 */
export function setDatabase(database: DatabaseType): void {
  db = database
}

/**
 * Initialize and return a new database instance with migrations.
 * Optionally provide a custom path; defaults to ~/.kombuse/data.db
 */
export function initializeDatabase(dbPath?: string): DatabaseType {
  const resolvedPath =
    dbPath ??
    join(
      process.env.HOME || process.env.USERPROFILE || '.',
      '.kombuse',
      'data.db'
    )

  // Ensure directory exists
  const dataDir = join(resolvedPath, '..')
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  const database = new Database(resolvedPath)

  // Enable WAL mode for better concurrent performance
  database.pragma('journal_mode = WAL')

  // Run migrations
  runMigrations(database)

  return database
}

/**
 * Get the current database instance.
 * Throws if no database has been set or initialized.
 */
export function getDatabase(): DatabaseType {
  if (!db) {
    throw new Error(
      'Database not initialized. Call setDatabase() or initializeDatabase() first.'
    )
  }
  return db
}

/**
 * Close the database connection (for cleanup)
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function runMigrations(db: DatabaseType): void {
  // Create migrations table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = db
    .prepare('SELECT name FROM migrations')
    .all() as { name: string }[]
  const appliedSet = new Set(applied.map((m) => m.name))

  for (const migration of migrations) {
    if (!appliedSet.has(migration.name)) {
      db.exec(migration.sql)
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name)
    }
  }
}

const migrations = [
  {
    name: '001_create_tickets',
    sql: `
      CREATE TABLE tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        body TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'in_progress')),
        priority INTEGER CHECK (priority BETWEEN 0 AND 4),
        project_id TEXT,
        github_id INTEGER,
        repo_name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX idx_tickets_status ON tickets(status);
      CREATE INDEX idx_tickets_project_id ON tickets(project_id);
    `,
  },
  {
    name: '002_create_ticket_activities',
    sql: `
      CREATE TABLE ticket_activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX idx_ticket_activities_ticket_id ON ticket_activities(ticket_id);
    `,
  },
]
