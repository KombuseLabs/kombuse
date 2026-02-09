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
  // Enforce foreign-key constraints consistently in every connection.
  database.pragma('foreign_keys = ON')

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
  // Ensure FK checks are active for migrations and test DBs.
  db.pragma('foreign_keys = ON')

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
    name: '001_initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS profiles (
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

      CREATE INDEX IF NOT EXISTS idx_profiles_type ON profiles(type);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_external ON profiles(external_source, external_id)
        WHERE external_source IS NOT NULL;

      CREATE TABLE IF NOT EXISTS profile_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        setting_key TEXT NOT NULL,
        setting_value TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(profile_id, setting_key)
      );

      CREATE INDEX IF NOT EXISTS idx_profile_settings_profile ON profile_settings(profile_id);

      CREATE TABLE IF NOT EXISTS projects (
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

      CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

      CREATE TABLE IF NOT EXISTS labels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#808080',
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_labels_project ON labels(project_id);

      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL REFERENCES profiles(id),
        assignee_id TEXT REFERENCES profiles(id),
        claimed_by_id TEXT REFERENCES profiles(id),
        title TEXT NOT NULL,
        body TEXT,
        status TEXT NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'closed', 'in_progress', 'blocked')),
        priority INTEGER CHECK (priority BETWEEN 0 AND 4),
        claimed_at TEXT,
        claim_expires_at TEXT,
        external_source TEXT,
        external_id TEXT,
        external_url TEXT,
        synced_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_author ON tickets(author_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_project_status_updated ON tickets(project_id, status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tickets_project_assignee_status ON tickets(project_id, assignee_id, status) WHERE assignee_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_tickets_project_claim_expiry ON tickets(project_id, claim_expires_at) WHERE claim_expires_at IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_external ON tickets(external_source, external_id)
        WHERE external_source IS NOT NULL;

      CREATE TABLE IF NOT EXISTS ticket_labels (
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
        added_by_id TEXT REFERENCES profiles(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (ticket_id, label_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ticket_labels_label ON ticket_labels(label_id);

      CREATE TABLE IF NOT EXISTS comments (
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

      CREATE INDEX IF NOT EXISTS idx_comments_ticket ON comments(ticket_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id);
      CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id) WHERE parent_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS mentions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
        mention_type TEXT NOT NULL CHECK (mention_type IN ('profile', 'ticket')),
        mentioned_profile_id TEXT REFERENCES profiles(id),
        mentioned_ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
        mention_text TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (
          (mention_type = 'profile' AND mentioned_profile_id IS NOT NULL AND mentioned_ticket_id IS NULL) OR
          (mention_type = 'ticket' AND mentioned_profile_id IS NULL AND mentioned_ticket_id IS NOT NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS idx_mentions_comment ON mentions(comment_id);
      CREATE INDEX IF NOT EXISTS idx_mentions_profile ON mentions(mentioned_profile_id) WHERE mentioned_profile_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_mentions_ticket ON mentions(mentioned_ticket_id) WHERE mentioned_ticket_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS attachments (
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

      CREATE INDEX IF NOT EXISTS idx_attachments_comment ON attachments(comment_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON attachments(ticket_id);

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
        comment_id INTEGER REFERENCES comments(id) ON DELETE SET NULL,
        actor_id TEXT REFERENCES profiles(id),
        actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
        payload TEXT NOT NULL CHECK (json_valid(payload)),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_events_ticket ON events(ticket_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_tickets_claimed ON tickets(claimed_at) WHERE claimed_at IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id) WHERE assignee_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS event_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscriber_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        last_processed_event_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(subscriber_id, event_type, project_id)
      );

      CREATE INDEX IF NOT EXISTS idx_event_subs_subscriber ON event_subscriptions(subscriber_id);
      CREATE INDEX IF NOT EXISTS idx_event_subs_type ON event_subscriptions(event_type);
      CREATE INDEX IF NOT EXISTS idx_tickets_claimed_by ON tickets(claimed_by_id) WHERE claimed_by_id IS NOT NULL;

      -- Sessions table for storing agent conversation history
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        kombuse_session_id TEXT UNIQUE,
        backend_type TEXT,
        backend_session_id TEXT,
        status TEXT NOT NULL DEFAULT 'running'
          CHECK (status IN ('running', 'completed', 'failed', 'aborted')),
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        failed_at TEXT,
        last_event_seq INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_backend_ref ON sessions(backend_type, backend_session_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_kombuse ON sessions(kombuse_session_id);

      CREATE TABLE IF NOT EXISTS session_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL CHECK (json_valid(payload)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(session_id, seq)
      );

      CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events(session_id, seq);

      -- Agents table (extends profiles)
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
        system_prompt TEXT NOT NULL,
        permissions TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(permissions)),
        config TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config)),
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Agent triggers table
      CREATE TABLE IF NOT EXISTS agent_triggers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        conditions TEXT CHECK (conditions IS NULL OR json_valid(conditions)),
        is_enabled INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_agent_triggers_event ON agent_triggers(event_type, is_enabled);
      CREATE INDEX IF NOT EXISTS idx_agent_triggers_agent ON agent_triggers(agent_id);

      -- Agent invocations table
      CREATE TABLE IF NOT EXISTS agent_invocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        trigger_id INTEGER NOT NULL REFERENCES agent_triggers(id) ON DELETE CASCADE,
        event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
        session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
        run_at TEXT NOT NULL DEFAULT (datetime('now')),
        context TEXT NOT NULL CHECK (json_valid(context)),
        result TEXT CHECK (result IS NULL OR json_valid(result)),
        error TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_agent_invocations_agent ON agent_invocations(agent_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_status ON agent_invocations(status);
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_run_at ON agent_invocations(status, run_at);
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_session ON agent_invocations(session_id);
    `,
  },
  {
    name: '002_invocation_kombuse_session_id',
    sql: `
      ALTER TABLE agent_invocations ADD COLUMN kombuse_session_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_kombuse_session
        ON agent_invocations(kombuse_session_id);
    `,
  },
  {
    name: '003_session_ticket_id',
    sql: `
      ALTER TABLE sessions ADD COLUMN ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_sessions_ticket ON sessions(ticket_id, status) WHERE ticket_id IS NOT NULL;
    `,
  },
  {
    name: '004_comment_kombuse_session_id',
    sql: `
      ALTER TABLE comments ADD COLUMN kombuse_session_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_comments_session ON comments(kombuse_session_id) WHERE kombuse_session_id IS NOT NULL;
    `,
  },
  {
    name: '005_event_kombuse_session_id',
    sql: `
      ALTER TABLE events ADD COLUMN kombuse_session_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_events_session ON events(kombuse_session_id) WHERE kombuse_session_id IS NOT NULL;
    `,
  },
  {
    name: '006_ticket_opened_closed_at',
    sql: `
      ALTER TABLE tickets ADD COLUMN opened_at TEXT;
      ALTER TABLE tickets ADD COLUMN closed_at TEXT;

      UPDATE tickets SET opened_at = created_at;

      UPDATE tickets SET closed_at = (
        SELECT e.created_at FROM events e
        WHERE e.ticket_id = tickets.id
          AND e.event_type = 'ticket.closed'
        ORDER BY e.created_at DESC LIMIT 1
      ) WHERE status = 'closed';

      CREATE INDEX IF NOT EXISTS idx_tickets_opened_at ON tickets(opened_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tickets_closed_at ON tickets(closed_at DESC) WHERE closed_at IS NOT NULL;
    `,
  },
  {
    name: '007_ticket_last_activity_at',
    sql: `
      ALTER TABLE tickets ADD COLUMN last_activity_at TEXT;

      UPDATE tickets SET last_activity_at = COALESCE(
        (SELECT MAX(e.created_at) FROM events e WHERE e.ticket_id = tickets.id),
        tickets.updated_at
      );

      CREATE INDEX IF NOT EXISTS idx_tickets_last_activity ON tickets(project_id, last_activity_at DESC);
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

  // Seed anonymous agent profile for MCP tools
  const existingAgent = database
    .prepare('SELECT id FROM profiles WHERE id = ?')
    .get('anonymous-agent')

  if (!existingAgent) {
    database.prepare(`
      INSERT INTO profiles (id, type, name, description)
      VALUES (?, ?, ?, ?)
    `).run(
      'anonymous-agent',
      'agent',
      'Anonymous Agent',
      'Default profile for AI agents using MCP tools'
    )
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
