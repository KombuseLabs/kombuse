import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'
import { join, resolve } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { toSlug } from '@kombuse/types'
import { loadKombuseConfig, getKombuseDir, resolveDbPath } from './config'

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
  const defaultPath = join(getKombuseDir(), 'data.db')
  const config = loadKombuseConfig()
  const configPath = config.database?.path !== undefined
    ? resolveDbPath(config.database.path)
    : undefined
  const resolvedPath = dbPath ?? configPath ?? defaultPath
  console.log(`Initializing database at ${resolve(resolvedPath)}`)
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
      if (migration.postMigrate) {
        migration.postMigrate(db)
      }
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name)
    }
  }
}

const migrations: Array<{ name: string; sql: string; postMigrate?: (db: DatabaseType) => void }> = [
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
  {
    name: '008_fts_search',
    sql: `
      CREATE VIRTUAL TABLE IF NOT EXISTS tickets_fts USING fts5(
        title,
        body,
        content=tickets,
        content_rowid=id,
        tokenize='porter unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS tickets_fts_insert
      AFTER INSERT ON tickets
      BEGIN
        INSERT INTO tickets_fts(rowid, title, body)
        VALUES (new.id, new.title, COALESCE(new.body, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS tickets_fts_delete
      AFTER DELETE ON tickets
      BEGIN
        INSERT INTO tickets_fts(tickets_fts, rowid, title, body)
        VALUES ('delete', old.id, old.title, COALESCE(old.body, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS tickets_fts_update
      AFTER UPDATE ON tickets
      BEGIN
        INSERT INTO tickets_fts(tickets_fts, rowid, title, body)
        VALUES ('delete', old.id, old.title, COALESCE(old.body, ''));
        INSERT INTO tickets_fts(rowid, title, body)
        VALUES (new.id, new.title, COALESCE(new.body, ''));
      END;

      INSERT INTO tickets_fts(rowid, title, body)
      SELECT id, title, COALESCE(body, '') FROM tickets;
    `,
  },
  {
    name: '009_ticket_views',
    sql: `
      CREATE TABLE IF NOT EXISTS ticket_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        last_viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(ticket_id, profile_id)
      );

      -- For querying views by profile (e.g. "all tickets viewed by user X").
      -- The UNIQUE(ticket_id, profile_id) constraint covers the LEFT JOIN lookup in ticket list queries.
      CREATE INDEX IF NOT EXISTS idx_ticket_views_profile
        ON ticket_views(profile_id, ticket_id);
    `,
  },
  {
    name: '010_agent_permissions',
    sql: `
      -- Code Reviewer: can close tickets, add/remove labels, update fields, comment
      UPDATE agents SET permissions = '[{"type":"resource","resource":"ticket","actions":["read","update"],"scope":"global"},{"type":"resource","resource":"ticket.status","actions":["update"],"scope":"global"},{"type":"resource","resource":"ticket.labels","actions":["update","delete"],"scope":"global"},{"type":"resource","resource":"comment","actions":["read","create"],"scope":"global"}]'
        WHERE id = '00e3f633-2389-4a19-a426-7a283df09344' AND permissions = '[]';

      -- Coding Agent: can update fields, add labels, create tickets, comment (NO status change, NO label removal)
      UPDATE agents SET permissions = '[{"type":"resource","resource":"ticket","actions":["read","update","create"],"scope":"global"},{"type":"resource","resource":"ticket.labels","actions":["update"],"scope":"global"},{"type":"resource","resource":"comment","actions":["read","create"],"scope":"global"}]'
        WHERE id = '67f50aa1-7598-43f6-ae72-448c28acc411' AND permissions = '[]';

      -- Ticket Analyzer: can update fields, add labels, comment
      UPDATE agents SET permissions = '[{"type":"resource","resource":"ticket","actions":["read","update"],"scope":"global"},{"type":"resource","resource":"ticket.labels","actions":["update"],"scope":"global"},{"type":"resource","resource":"comment","actions":["read","create"],"scope":"global"}]'
        WHERE id = '156c702f-217a-4a26-8f4b-7123b8373354' AND permissions = '[]';

      -- Planning Agent: can create/update tickets, add labels, comment
      UPDATE agents SET permissions = '[{"type":"resource","resource":"ticket","actions":["read","create","update"],"scope":"global"},{"type":"resource","resource":"ticket.labels","actions":["update"],"scope":"global"},{"type":"resource","resource":"comment","actions":["read","create"],"scope":"global"}]'
        WHERE id = '79710145-6527-4cdb-8a05-c301484f9e95' AND permissions = '[]';

      -- Summarizer: read-only tickets, can comment
      UPDATE agents SET permissions = '[{"type":"resource","resource":"ticket","actions":["read"],"scope":"global"},{"type":"resource","resource":"comment","actions":["read","create"],"scope":"global"}]'
        WHERE id = 'd2786543-5336-4989-b292-03f2ba264f79' AND permissions = '[]';
    `,
  },
  {
    name: '011_cleanup_legacy_session_ids',
    sql: `
      -- Create temp mapping table for invocation-* IDs to new trigger-{uuid} IDs
      CREATE TEMP TABLE IF NOT EXISTS session_id_mapping (
        old_id TEXT PRIMARY KEY,
        new_id TEXT NOT NULL
      );

      -- Generate new trigger-{uuid} IDs for each invocation-* session
      INSERT INTO session_id_mapping (old_id, new_id)
      SELECT kombuse_session_id,
        'trigger-'
        || lower(hex(randomblob(4))) || '-'
        || lower(hex(randomblob(2))) || '-4'
        || substr(lower(hex(randomblob(2))), 2) || '-'
        || substr('89ab', abs(random()) % 4 + 1, 1)
        || substr(lower(hex(randomblob(2))), 2) || '-'
        || lower(hex(randomblob(6)))
      FROM sessions
      WHERE kombuse_session_id LIKE 'invocation-%';

      -- Update sessions table: invocation-* -> trigger-{uuid}
      UPDATE sessions SET kombuse_session_id = (
        SELECT new_id FROM session_id_mapping WHERE old_id = sessions.kombuse_session_id
      ) WHERE kombuse_session_id LIKE 'invocation-%';

      -- Update agent_invocations table with same new IDs
      UPDATE agent_invocations SET kombuse_session_id = (
        SELECT new_id FROM session_id_mapping WHERE old_id = agent_invocations.kombuse_session_id
      ) WHERE kombuse_session_id LIKE 'invocation-%';

      -- Bare UUIDs in sessions: prefix with 'trigger-'
      UPDATE sessions SET kombuse_session_id = 'trigger-' || kombuse_session_id
      WHERE kombuse_session_id IS NOT NULL
        AND kombuse_session_id NOT LIKE 'chat-%'
        AND kombuse_session_id NOT LIKE 'trigger-%';

      DROP TABLE IF EXISTS session_id_mapping;
    `,
  },
  {
    name: '012_comments_fts_search',
    sql: `
      CREATE VIRTUAL TABLE IF NOT EXISTS comments_fts USING fts5(
        body,
        content=comments,
        content_rowid=id,
        tokenize='porter unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS comments_fts_insert
      AFTER INSERT ON comments
      BEGIN
        INSERT INTO comments_fts(rowid, body)
        VALUES (new.id, COALESCE(new.body, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS comments_fts_delete
      AFTER DELETE ON comments
      BEGIN
        INSERT INTO comments_fts(comments_fts, rowid, body)
        VALUES ('delete', old.id, COALESCE(old.body, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS comments_fts_update
      AFTER UPDATE ON comments
      BEGIN
        INSERT INTO comments_fts(comments_fts, rowid, body)
        VALUES ('delete', old.id, COALESCE(old.body, ''));
        INSERT INTO comments_fts(rowid, body)
        VALUES (new.id, COALESCE(new.body, ''));
      END;

      INSERT INTO comments_fts(rowid, body)
      SELECT id, COALESCE(body, '') FROM comments;
    `,
  },
  {
    name: '013_comments_parent_set_null',
    sql: `
      PRAGMA foreign_keys = OFF;

      CREATE TABLE comments_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL REFERENCES profiles(id),
        parent_id INTEGER REFERENCES comments_new(id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        external_source TEXT,
        external_id TEXT,
        synced_at TEXT,
        is_edited INTEGER NOT NULL DEFAULT 0,
        kombuse_session_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO comments_new (id, ticket_id, author_id, parent_id, body, external_source, external_id, synced_at, is_edited, kombuse_session_id, created_at, updated_at)
        SELECT id, ticket_id, author_id, parent_id, body, external_source, external_id, synced_at, is_edited, kombuse_session_id, created_at, updated_at
        FROM comments;

      DROP TABLE comments;

      ALTER TABLE comments_new RENAME TO comments;

      CREATE INDEX IF NOT EXISTS idx_comments_ticket ON comments(ticket_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id);
      CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id) WHERE parent_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_comments_session ON comments(kombuse_session_id) WHERE kombuse_session_id IS NOT NULL;

      CREATE TRIGGER IF NOT EXISTS comments_fts_insert
      AFTER INSERT ON comments
      BEGIN
        INSERT INTO comments_fts(rowid, body)
        VALUES (new.id, COALESCE(new.body, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS comments_fts_delete
      AFTER DELETE ON comments
      BEGIN
        INSERT INTO comments_fts(comments_fts, rowid, body)
        VALUES ('delete', old.id, COALESCE(old.body, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS comments_fts_update
      AFTER UPDATE ON comments
      BEGIN
        INSERT INTO comments_fts(comments_fts, rowid, body)
        VALUES ('delete', old.id, COALESCE(old.body, ''));
        INSERT INTO comments_fts(rowid, body)
        VALUES (new.id, COALESCE(new.body, ''));
      END;

      PRAGMA foreign_keys = ON;
    `,
  },
  {
    name: '014_session_agent_id',
    sql: `
      ALTER TABLE sessions ADD COLUMN agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id) WHERE agent_id IS NOT NULL;
    `,
  },
  {
    name: '015_milestones',
    sql: `
      CREATE TABLE IF NOT EXISTS milestones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        due_date TEXT,
        status TEXT NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'closed')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
      CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);

      ALTER TABLE tickets ADD COLUMN milestone_id INTEGER
        REFERENCES milestones(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_tickets_milestone
        ON tickets(milestone_id) WHERE milestone_id IS NOT NULL;
    `,
  },
  {
    name: '016_session_state_machine',
    sql: `
      PRAGMA foreign_keys = OFF;

      CREATE TABLE sessions_new (
        id TEXT PRIMARY KEY,
        kombuse_session_id TEXT UNIQUE,
        backend_type TEXT,
        backend_session_id TEXT,
        ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
        agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'running', 'completed', 'failed', 'aborted', 'stopped')),
        metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        failed_at TEXT,
        last_event_seq INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO sessions_new (id, kombuse_session_id, backend_type, backend_session_id,
        ticket_id, agent_id, status, metadata, started_at, completed_at, failed_at,
        last_event_seq, created_at, updated_at)
        SELECT id, kombuse_session_id, backend_type, backend_session_id,
          ticket_id, agent_id, status, '{}', started_at, completed_at, failed_at,
          last_event_seq, created_at, updated_at
        FROM sessions;

      DROP TABLE sessions;
      ALTER TABLE sessions_new RENAME TO sessions;

      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_backend_ref ON sessions(backend_type, backend_session_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_kombuse ON sessions(kombuse_session_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_ticket ON sessions(ticket_id, status) WHERE ticket_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id) WHERE agent_id IS NOT NULL;

      PRAGMA foreign_keys = ON;
    `,
  },
  {
    name: '017_ticket_triggers_enabled',
    sql: `
      ALTER TABLE tickets ADD COLUMN triggers_enabled INTEGER NOT NULL DEFAULT 1;
    `,
  },
  {
    name: '018_session_abort_diagnostics',
    sql: `
      ALTER TABLE sessions ADD COLUMN aborted_at TEXT;

      -- Backfill legacy aborted rows so terminal time queries remain accurate.
      UPDATE sessions
      SET completed_at = NULL,
          failed_at = COALESCE(failed_at, updated_at),
          aborted_at = COALESCE(aborted_at, failed_at, updated_at)
      WHERE status = 'aborted';

      -- Backfill missing backend_session_id from persisted stream events.
      UPDATE sessions
      SET backend_session_id = COALESCE(
        (
          SELECT json_extract(se.payload, '$.sessionId')
          FROM session_events se
          WHERE se.session_id = sessions.id
            AND se.event_type = 'complete'
            AND json_type(se.payload, '$.sessionId') = 'text'
          ORDER BY se.seq DESC
          LIMIT 1
        ),
        (
          SELECT json_extract(se.payload, '$.data.session_id')
          FROM session_events se
          WHERE se.session_id = sessions.id
            AND se.event_type = 'raw'
            AND json_type(se.payload, '$.data.session_id') = 'text'
          ORDER BY se.seq ASC
          LIMIT 1
        ),
        (
          SELECT json_extract(se.payload, '$.data.sessionId')
          FROM session_events se
          WHERE se.session_id = sessions.id
            AND se.event_type = 'raw'
            AND json_type(se.payload, '$.data.sessionId') = 'text'
          ORDER BY se.seq ASC
          LIMIT 1
        )
      )
      WHERE (backend_session_id IS NULL OR trim(backend_session_id) = '')
        AND EXISTS (
          SELECT 1
          FROM session_events se
          WHERE se.session_id = sessions.id
            AND (
              (se.event_type = 'complete' AND json_type(se.payload, '$.sessionId') = 'text')
              OR
              (se.event_type = 'raw' AND (
                json_type(se.payload, '$.data.session_id') = 'text'
                OR json_type(se.payload, '$.data.sessionId') = 'text'
              ))
            )
        );

      -- Add explicit reason/source for legacy aborted rows that predate terminal metadata.
      UPDATE sessions
      SET metadata = json_set(
        json_set(metadata, '$.terminal_reason', 'legacy_abort'),
        '$.terminal_source',
        'migration_backfill'
      )
      WHERE status = 'aborted'
        AND json_extract(metadata, '$.terminal_reason') IS NULL;
    `,
  },
  {
    name: '019_session_invocation_project_scope',
    sql: `
      ALTER TABLE sessions
        ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_sessions_project
        ON sessions(project_id) WHERE project_id IS NOT NULL;

      ALTER TABLE agent_invocations
        ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_project
        ON agent_invocations(project_id) WHERE project_id IS NOT NULL;

      -- Backfill invocations from persisted context JSON.
      UPDATE agent_invocations
      SET project_id = json_extract(context, '$.project_id')
      WHERE project_id IS NULL
        AND json_type(context, '$.project_id') = 'text'
        AND EXISTS (
          SELECT 1
          FROM projects p
          WHERE p.id = json_extract(context, '$.project_id')
        );

      -- Fallback backfill for invocations with an event link.
      UPDATE agent_invocations
      SET project_id = (
        SELECT e.project_id
        FROM events e
        WHERE e.id = agent_invocations.event_id
      )
      WHERE project_id IS NULL
        AND event_id IS NOT NULL;

      -- Backfill sessions from linked tickets when available.
      UPDATE sessions
      SET project_id = (
        SELECT t.project_id
        FROM tickets t
        WHERE t.id = sessions.ticket_id
      )
      WHERE project_id IS NULL
        AND ticket_id IS NOT NULL;

      -- Backfill sessions from invocation lineage for trigger/chat sessions.
      UPDATE sessions
      SET project_id = (
        SELECT ai.project_id
        FROM agent_invocations ai
        WHERE ai.kombuse_session_id = sessions.kombuse_session_id
          AND ai.project_id IS NOT NULL
        ORDER BY ai.created_at DESC
        LIMIT 1
      )
      WHERE project_id IS NULL
        AND kombuse_session_id IS NOT NULL;

      -- Final fallback: hydrate invocations from linked session rows.
      UPDATE agent_invocations
      SET project_id = (
        SELECT s.project_id
        FROM sessions s
        WHERE s.id = agent_invocations.session_id
      )
      WHERE project_id IS NULL
        AND session_id IS NOT NULL;
    `,
  },
  {
    name: '020_ticket_loop_protection',
    sql: `
      ALTER TABLE tickets ADD COLUMN loop_protection_enabled INTEGER NOT NULL DEFAULT 1;
    `,
  },
  {
    name: '021_session_event_kombuse_session_id',
    sql: `
      ALTER TABLE session_events ADD COLUMN kombuse_session_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_session_events_kombuse_session
        ON session_events(kombuse_session_id) WHERE kombuse_session_id IS NOT NULL;
      UPDATE session_events SET kombuse_session_id = (
        SELECT s.kombuse_session_id FROM sessions s WHERE s.id = session_events.session_id
      );
    `,
  },
  {
    name: '022_agent_slug_and_descriptions',
    sql: `
      ALTER TABLE agents ADD COLUMN slug TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_slug ON agents(slug) WHERE slug IS NOT NULL;
    `,
    postMigrate: (db: DatabaseType) => {
      // Backfill slugs from profile names
      const rows = db
        .prepare(
          'SELECT a.id, p.name FROM agents a JOIN profiles p ON p.id = a.id'
        )
        .all() as { id: string; name: string }[]
      const update = db.prepare('UPDATE agents SET slug = ? WHERE id = ?')
      const usedSlugs = new Set<string>()
      for (const row of rows) {
        let slug = toSlug(row.name)
        // Handle collisions by appending a suffix
        if (usedSlugs.has(slug)) {
          let i = 2
          while (usedSlugs.has(`${slug}-${i}`)) i++
          slug = `${slug}-${i}`
        }
        usedSlugs.add(slug)
        update.run(slug, row.id)
      }

      // Backfill missing descriptions for agent profiles
      const descriptions: Record<string, string> = {
        Orchestrator:
          'Routes tickets through pipeline stages (Triage, Analyze, Plan, Implement, Review, Summarize)',
        'Triage Agent':
          'Classifies new tickets, searches for duplicates, and suggests priority',
        'Test Writer':
          'Writes and maintains test suites for code changes',
        'Ticket Analyzer':
          'Investigates codebase to find root cause and impact of issues',
        'Code Reviewer':
          'Reviews code changes for correctness, test coverage, and consistency',
      }
      const updateDesc = db.prepare(
        "UPDATE profiles SET description = ? WHERE id IN (SELECT id FROM agents) AND name = ? AND (description IS NULL OR trim(description) = '')"
      )
      for (const [name, desc] of Object.entries(descriptions)) {
        updateDesc.run(desc, name)
      }
    },
  },
  {
    name: '023_plugins_table',
    sql: `
      CREATE TABLE plugins (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '1.0.0',
        description TEXT,
        directory TEXT NOT NULL,
        manifest TEXT NOT NULL CHECK (json_valid(manifest)),
        is_enabled INTEGER NOT NULL DEFAULT 1,
        installed_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(project_id, name)
      );

      ALTER TABLE agents ADD COLUMN plugin_id TEXT REFERENCES plugins(id) ON DELETE SET NULL;
      ALTER TABLE agent_triggers ADD COLUMN plugin_id TEXT REFERENCES plugins(id) ON DELETE SET NULL;
      ALTER TABLE labels ADD COLUMN plugin_id TEXT REFERENCES plugins(id) ON DELETE SET NULL;
    `,
  },
  {
    name: '024_trigger_allowed_invokers',
    sql: `
      ALTER TABLE agent_triggers ADD COLUMN allowed_invokers TEXT DEFAULT NULL CHECK (allowed_invokers IS NULL OR json_valid(allowed_invokers));
    `,
  },
  {
    name: '025_session_events_event_type_index',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_session_events_event_type
        ON session_events(event_type, session_id);
    `,
  },
]

/**
 * Seed the database with default data for development.
 * Creates default profiles (user and anonymous agent).
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

}
