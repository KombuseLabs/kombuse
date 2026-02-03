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
  {
    name: '003_create_profiles',
    sql: `
      CREATE TABLE profiles (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('user', 'agent')),
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        description TEXT,
        avatar_url TEXT,
        external_source TEXT,
        external_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX idx_profiles_type ON profiles(type);
      CREATE UNIQUE INDEX idx_profiles_external ON profiles(external_source, external_id)
        WHERE external_source IS NOT NULL;
    `,
  },
  {
    name: '004_create_projects',
    sql: `
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        owner_id TEXT NOT NULL REFERENCES profiles(id),
        local_path TEXT,
        repo_source TEXT CHECK (repo_source IN ('github', 'gitlab', 'bitbucket')),
        repo_owner TEXT,
        repo_name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX idx_projects_owner ON projects(owner_id);
    `,
  },
  {
    name: '005_create_labels',
    sql: `
      CREATE TABLE labels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#808080',
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(project_id, name)
      );

      CREATE INDEX idx_labels_project ON labels(project_id);
    `,
  },
  {
    name: '006_recreate_tickets',
    sql: `
      DROP TABLE IF EXISTS ticket_activities;
      DROP TABLE IF EXISTS tickets;

      CREATE TABLE tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL REFERENCES profiles(id),
        assignee_id TEXT REFERENCES profiles(id),
        title TEXT NOT NULL,
        body TEXT,
        status TEXT NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'closed', 'in_progress', 'blocked')),
        priority INTEGER CHECK (priority BETWEEN 0 AND 4),
        external_source TEXT,
        external_id TEXT,
        external_url TEXT,
        synced_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX idx_tickets_project ON tickets(project_id);
      CREATE INDEX idx_tickets_status ON tickets(status);
      CREATE INDEX idx_tickets_author ON tickets(author_id);
      CREATE UNIQUE INDEX idx_tickets_external ON tickets(external_source, external_id)
        WHERE external_source IS NOT NULL;
    `,
  },
  {
    name: '007_create_ticket_labels',
    sql: `
      CREATE TABLE ticket_labels (
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
        added_by_id TEXT REFERENCES profiles(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (ticket_id, label_id)
      );

      CREATE INDEX idx_ticket_labels_label ON ticket_labels(label_id);
    `,
  },
  {
    name: '008_create_comments',
    sql: `
      CREATE TABLE comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL REFERENCES profiles(id),
        parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        external_source TEXT,
        external_id TEXT,
        synced_at TEXT,
        is_edited INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX idx_comments_ticket ON comments(ticket_id, created_at);
      CREATE INDEX idx_comments_author ON comments(author_id);
      CREATE INDEX idx_comments_parent ON comments(parent_id) WHERE parent_id IS NOT NULL;
    `,
  },
  {
    name: '009_create_mentions',
    sql: `
      CREATE TABLE mentions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
        mentioned_id TEXT NOT NULL REFERENCES profiles(id),
        mention_text TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX idx_mentions_comment ON mentions(comment_id);
      CREATE INDEX idx_mentions_mentioned ON mentions(mentioned_id);
    `,
  },
  {
    name: '010_create_attachments',
    sql: `
      CREATE TABLE attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
        ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        uploaded_by_id TEXT NOT NULL REFERENCES profiles(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (
          (comment_id IS NOT NULL AND ticket_id IS NULL) OR
          (comment_id IS NULL AND ticket_id IS NOT NULL)
        )
      );

      CREATE INDEX idx_attachments_comment ON attachments(comment_id);
      CREATE INDEX idx_attachments_ticket ON attachments(ticket_id);
    `,
  },
  {
    name: '011_create_events',
    sql: `
      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
        comment_id INTEGER REFERENCES comments(id) ON DELETE SET NULL,
        actor_id TEXT REFERENCES profiles(id),
        actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX idx_events_ticket ON events(ticket_id, created_at DESC);
      CREATE INDEX idx_events_project ON events(project_id, created_at DESC);
      CREATE INDEX idx_events_type ON events(event_type, created_at DESC);
    `,
  },
  {
    name: '012_add_ticket_claim_tracking',
    sql: `
      ALTER TABLE tickets ADD COLUMN claimed_at TEXT;
      ALTER TABLE tickets ADD COLUMN claim_expires_at TEXT;

      CREATE INDEX idx_tickets_claimed ON tickets(claimed_at) WHERE claimed_at IS NOT NULL;
      CREATE INDEX idx_tickets_assignee ON tickets(assignee_id) WHERE assignee_id IS NOT NULL;
    `,
  },
  {
    name: '013_create_event_subscriptions',
    sql: `
      CREATE TABLE event_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscriber_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        last_processed_event_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(subscriber_id, event_type, project_id)
      );

      CREATE INDEX idx_event_subs_subscriber ON event_subscriptions(subscriber_id);
      CREATE INDEX idx_event_subs_type ON event_subscriptions(event_type);
    `,
  },
  {
    name: '014_add_ticket_claimed_by',
    sql: `
      ALTER TABLE tickets ADD COLUMN claimed_by_id TEXT REFERENCES profiles(id);

      CREATE INDEX idx_tickets_claimed_by ON tickets(claimed_by_id) WHERE claimed_by_id IS NOT NULL;
    `,
  },
  {
    name: '015_normalize_claim_expires_at',
    sql: `
      UPDATE tickets
      SET claim_expires_at = substr(
        replace(replace(claim_expires_at, 'T', ' '), 'Z', ''),
        1,
        19
      )
      WHERE claim_expires_at IS NOT NULL AND claim_expires_at LIKE '%T%';
    `,
  },
]

/**
 * Seed the database with default data for development.
 * Creates a default user profile and sample projects.
 * Safe to call multiple times - only inserts if data doesn't exist.
 */
export function seedDatabase(database: DatabaseType): void {
  // Check if default user exists
  const existingUser = database
    .prepare('SELECT id FROM profiles WHERE id = ?')
    .get('user-1')

  if (!existingUser) {
    database.prepare(`
      INSERT INTO profiles (id, type, name, email)
      VALUES (?, ?, ?, ?)
    `).run('user-1', 'user', 'Default User', 'user@example.com')
  }

  // Seed default projects
  const projects = [
    {
      id: '1',
      name: 'Kombuse Core',
      description: 'Core platform services and infrastructure',
      repo_source: 'github',
      repo_owner: 'kombuse',
      repo_name: 'kombuse-core',
    },
    {
      id: '2',
      name: 'Kombuse Web',
      description: 'Web application and frontend components',
      repo_source: 'github',
      repo_owner: 'kombuse',
      repo_name: 'kombuse-web',
    },
    {
      id: '3',
      name: 'Kombuse API',
      description: 'REST API and backend services',
      repo_source: 'github',
      repo_owner: 'kombuse',
      repo_name: 'kombuse-api',
    },
  ]

  const insertProject = database.prepare(`
    INSERT OR IGNORE INTO projects (id, name, description, owner_id, repo_source, repo_owner, repo_name)
    VALUES (?, ?, ?, 'user-1', ?, ?, ?)
  `)

  for (const project of projects) {
    insertProject.run(
      project.id,
      project.name,
      project.description,
      project.repo_source,
      project.repo_owner,
      project.repo_name
    )
  }
}
