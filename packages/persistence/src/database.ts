import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'
import { AsyncLocalStorage } from 'node:async_hooks'
import { join, resolve } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { createAppLogger } from '@kombuse/core/logger'
import { loadKombuseConfig, getKombuseDir, resolveDbPath } from './config.repository'

const logger = createAppLogger('Database')

export type { Database as DatabaseType } from 'better-sqlite3'

/** Stable UUID for the demo project seeded in isolated databases (docs.db). */
export const DEMO_PROJECT_ID = '00000000-0000-4000-a000-000000000001'

let db: DatabaseType | null = null

/**
 * Per-request database context. Each Fastify server instance sets this in an
 * onRequest hook so that repository calls within the request's async context
 * read from the correct database (primary or isolated) without touching the
 * shared module-level `db` global.
 */
export const dbContext = new AsyncLocalStorage<{ db: DatabaseType }>()

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
  logger.info(`Initializing database at ${resolve(resolvedPath)}`)
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
 * Checks the per-request AsyncLocalStorage context first (set by each Fastify
 * server's onRequest hook), then falls back to the global singleton.
 * Throws if neither is available.
 */
export function getDatabase(): DatabaseType {
  const store = dbContext.getStore()
  if (store) return store.db
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

type Migration = { name: string; sql: string }

const migrations: Migration[] = [
  {
    name: '001_schema',
    sql: `
      -- 1. profiles
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
        slug TEXT,
        plugin_id TEXT REFERENCES plugins(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_profiles_type ON profiles(type);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_external ON profiles(external_source, external_id)
        WHERE external_source IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_slug_plugin ON profiles(slug, plugin_id)
        WHERE slug IS NOT NULL AND plugin_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_slug_global ON profiles(slug)
        WHERE slug IS NOT NULL AND plugin_id IS NULL;

      -- 2. profile_settings
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

      -- 3. projects
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        owner_id TEXT NOT NULL REFERENCES profiles(id),
        local_path TEXT,
        repo_source TEXT CHECK (repo_source IN ('github', 'gitlab', 'bitbucket')),
        repo_owner TEXT,
        repo_name TEXT,
        slug TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_local_path
        ON projects(local_path) WHERE local_path IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);

      -- 4. plugins (before labels/agents/triggers which reference it)
      CREATE TABLE IF NOT EXISTS plugins (
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

      -- 5. labels
      CREATE TABLE IF NOT EXISTS labels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#808080',
        description TEXT,
        plugin_id TEXT REFERENCES plugins(id) ON DELETE SET NULL,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        slug TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_labels_project ON labels(project_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_labels_slug_plugin ON labels(slug, plugin_id, project_id)
        WHERE slug IS NOT NULL AND plugin_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_labels_slug_global ON labels(slug, project_id)
        WHERE slug IS NOT NULL AND plugin_id IS NULL;

      -- 6. milestones
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

      -- 7. tickets
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
        milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL,
        external_source TEXT,
        external_id TEXT,
        external_url TEXT,
        synced_at TEXT,
        opened_at TEXT,
        closed_at TEXT,
        last_activity_at TEXT,
        triggers_enabled INTEGER NOT NULL DEFAULT 1,
        loop_protection_enabled INTEGER NOT NULL DEFAULT 1,
        ticket_number INTEGER,
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
      CREATE INDEX IF NOT EXISTS idx_tickets_claimed ON tickets(claimed_at) WHERE claimed_at IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id) WHERE assignee_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_tickets_claimed_by ON tickets(claimed_by_id) WHERE claimed_by_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_tickets_opened_at ON tickets(opened_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tickets_closed_at ON tickets(closed_at DESC) WHERE closed_at IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_tickets_last_activity ON tickets(project_id, last_activity_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tickets_milestone ON tickets(milestone_id) WHERE milestone_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(project_id, priority DESC) WHERE priority IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_project_number ON tickets(project_id, ticket_number);

      -- 8. ticket_labels
      CREATE TABLE IF NOT EXISTS ticket_labels (
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
        added_by_id TEXT REFERENCES profiles(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (ticket_id, label_id)
      );
      CREATE INDEX IF NOT EXISTS idx_ticket_labels_label ON ticket_labels(label_id);

      -- 9. comments
      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL REFERENCES profiles(id),
        parent_id INTEGER REFERENCES comments(id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        external_source TEXT,
        external_id TEXT,
        synced_at TEXT,
        is_edited INTEGER NOT NULL DEFAULT 0,
        kombuse_session_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_comments_ticket ON comments(ticket_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id);
      CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id) WHERE parent_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_comments_session ON comments(kombuse_session_id) WHERE kombuse_session_id IS NOT NULL;

      -- 10. mentions
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

      -- 11. attachments
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

      -- 12. events
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
        comment_id INTEGER REFERENCES comments(id) ON DELETE SET NULL,
        actor_id TEXT REFERENCES profiles(id),
        actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
        payload TEXT NOT NULL CHECK (json_valid(payload)),
        kombuse_session_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_events_ticket ON events(ticket_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_session ON events(kombuse_session_id) WHERE kombuse_session_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_events_project_actor ON events(project_id, actor_type, created_at DESC);

      -- 13. event_subscriptions
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

      -- 14. sessions
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        kombuse_session_id TEXT UNIQUE,
        backend_type TEXT,
        backend_session_id TEXT,
        ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
        agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'running', 'completed', 'failed', 'aborted', 'stopped')),
        metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        failed_at TEXT,
        aborted_at TEXT,
        last_event_seq INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_backend_ref ON sessions(backend_type, backend_session_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_kombuse ON sessions(kombuse_session_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_ticket ON sessions(ticket_id, status) WHERE ticket_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id) WHERE agent_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id) WHERE project_id IS NOT NULL;

      -- 15. session_events
      CREATE TABLE IF NOT EXISTS session_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL CHECK (json_valid(payload)),
        kombuse_session_id TEXT,
        request_id TEXT GENERATED ALWAYS AS (json_extract(payload, '$.requestId')) VIRTUAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(session_id, seq)
      );
      CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events(session_id, seq);
      CREATE INDEX IF NOT EXISTS idx_session_events_kombuse_session
        ON session_events(kombuse_session_id) WHERE kombuse_session_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_session_events_event_type
        ON session_events(event_type, session_id);
      CREATE INDEX IF NOT EXISTS idx_session_events_type_created
        ON session_events(event_type, created_at);
      CREATE INDEX IF NOT EXISTS idx_session_events_request_id
        ON session_events(request_id) WHERE request_id IS NOT NULL;

      -- 16. agents
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
        system_prompt TEXT NOT NULL,
        permissions TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(permissions)),
        config TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config)),
        is_enabled INTEGER NOT NULL DEFAULT 1,
        slug TEXT,
        plugin_id TEXT REFERENCES plugins(id) ON DELETE SET NULL,
        plugin_base TEXT DEFAULT NULL CHECK (plugin_base IS NULL OR json_valid(plugin_base)),
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_slug_plugin ON agents(slug, plugin_id, project_id)
        WHERE slug IS NOT NULL AND plugin_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_slug_project ON agents(slug, project_id)
        WHERE slug IS NOT NULL AND plugin_id IS NULL AND project_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_slug_global ON agents(slug)
        WHERE slug IS NOT NULL AND plugin_id IS NULL AND project_id IS NULL;
      CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project_id)
        WHERE project_id IS NOT NULL;

      -- 17. agent_triggers
      CREATE TABLE IF NOT EXISTS agent_triggers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        conditions TEXT CHECK (conditions IS NULL OR json_valid(conditions)),
        is_enabled INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 0,
        plugin_id TEXT REFERENCES plugins(id) ON DELETE SET NULL,
        allowed_invokers TEXT DEFAULT NULL CHECK (allowed_invokers IS NULL OR json_valid(allowed_invokers)),
        slug TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_agent_triggers_event ON agent_triggers(event_type, is_enabled);
      CREATE INDEX IF NOT EXISTS idx_agent_triggers_agent ON agent_triggers(agent_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_triggers_slug_plugin
        ON agent_triggers(slug, agent_id, plugin_id)
        WHERE slug IS NOT NULL AND plugin_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_triggers_slug_global
        ON agent_triggers(slug, agent_id)
        WHERE slug IS NOT NULL AND plugin_id IS NULL;

      -- 18. agent_invocations
      CREATE TABLE IF NOT EXISTS agent_invocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        trigger_id INTEGER REFERENCES agent_triggers(id) ON DELETE CASCADE,
        event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
        session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
        run_at TEXT NOT NULL DEFAULT (datetime('now')),
        context TEXT NOT NULL CHECK (json_valid(context)),
        result TEXT CHECK (result IS NULL OR json_valid(result)),
        error TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        kombuse_session_id TEXT,
        ticket_id INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_agent ON agent_invocations(agent_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_status ON agent_invocations(status);
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_run_at ON agent_invocations(status, run_at);
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_session ON agent_invocations(session_id);
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_kombuse_session
        ON agent_invocations(kombuse_session_id);
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_project
        ON agent_invocations(project_id) WHERE project_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_ticket_status
        ON agent_invocations(agent_id, ticket_id, status);

      -- 19. ticket_views
      CREATE TABLE IF NOT EXISTS ticket_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        last_viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(ticket_id, profile_id)
      );
      CREATE INDEX IF NOT EXISTS idx_ticket_views_profile
        ON ticket_views(profile_id, ticket_id);

      -- 20. plugin_files
      CREATE TABLE IF NOT EXISTS plugin_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        is_user_modified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(plugin_id, path)
      );

      -- 21. tickets_fts (full-text search)
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

      -- 22. comments_fts (full-text search)
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
    `,
  },
  {
    name: '002_agent_comment_update_permission',
    sql: `
      UPDATE agents
      SET permissions = REPLACE(
        permissions,
        '"resource":"comment","actions":["read","create"]',
        '"resource":"comment","actions":["read","create","update"]'
      ),
      updated_at = datetime('now')
      WHERE permissions LIKE '%"resource":"comment","actions":["read","create"]%'
        AND permissions NOT LIKE '%"resource":"comment","actions":["read","create","update"]%';
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

/**
 * Seed realistic demo data for isolated databases (e.g. docs screenshots).
 * Creates a project with tickets, labels, and comments so the UI isn't empty.
 *
 * Uses SQLite's PRAGMA user_version for incremental versioning — existing
 * databases automatically pick up new seed data on next server start.
 * To add new seed data: increment CURRENT_SEED_VERSION and add a new
 * `if (seedVersion < N)` block.
 */
export function seedDemoData(database: DatabaseType): void {
  const CURRENT_SEED_VERSION = 4

  // Migrate old non-UUID demo project ID to new UUID format
  const oldDemo = database.prepare("SELECT id FROM projects WHERE id = 'demo-project'").get()
  if (oldDemo) {
    database.prepare("UPDATE tickets SET project_id = ? WHERE project_id = 'demo-project'").run(DEMO_PROJECT_ID)
    database.prepare("UPDATE labels SET project_id = ? WHERE project_id = 'demo-project'").run(DEMO_PROJECT_ID)
    database.prepare("UPDATE projects SET id = ? WHERE id = 'demo-project'").run(DEMO_PROJECT_ID)
  }

  let seedVersion = database.pragma('user_version', { simple: true }) as number

  // Handle databases seeded before user_version was introduced
  if (seedVersion === 0) {
    const hasProject = database.prepare('SELECT 1 FROM projects WHERE id = ?').get(DEMO_PROJECT_ID)
    if (hasProject) seedVersion = 1
  }

  if (seedVersion >= CURRENT_SEED_VERSION) return

  const seed = database.transaction(() => {
    // --- Version 1: base demo data (project, tickets, labels, user comments) ---
    if (seedVersion < 1) {
      // Project
      database
        .prepare('INSERT INTO projects (id, name, slug, owner_id) VALUES (?, ?, ?, ?)')
        .run(DEMO_PROJECT_ID, 'Acme Project', 'acme-project', 'user-1')

      // Labels
      database
        .prepare(
          'INSERT INTO labels (project_id, name, color) VALUES (?, ?, ?)'
        )
        .run(DEMO_PROJECT_ID, 'Bug', '#ef4444')
      database
        .prepare(
          'INSERT INTO labels (project_id, name, color) VALUES (?, ?, ?)'
        )
        .run(DEMO_PROJECT_ID, 'Feature', '#3b82f6')
      database
        .prepare(
          'INSERT INTO labels (project_id, name, color) VALUES (?, ?, ?)'
        )
        .run(DEMO_PROJECT_ID, 'Documentation', '#22c55e')

      // Look up the auto-generated label IDs
      const bugLabel = database
        .prepare(
          `SELECT id FROM labels WHERE project_id = '${DEMO_PROJECT_ID}' AND name = 'Bug'`
        )
        .get() as { id: number }
      const featureLabel = database
        .prepare(
          `SELECT id FROM labels WHERE project_id = '${DEMO_PROJECT_ID}' AND name = 'Feature'`
        )
        .get() as { id: number }
      const docsLabel = database
        .prepare(
          `SELECT id FROM labels WHERE project_id = '${DEMO_PROJECT_ID}' AND name = 'Documentation'`
        )
        .get() as { id: number }

      // Tickets
      const insertTicket = database.prepare(`
        INSERT INTO tickets (
          project_id, author_id, title, status, priority, ticket_number,
          opened_at, closed_at, last_activity_at
        ) VALUES (
          '${DEMO_PROJECT_ID}', 'user-1', ?, ?, ?, ?,
          datetime('now'), CASE WHEN ? = 'closed' THEN datetime('now') ELSE NULL END, datetime('now')
        )
        RETURNING id
      `)

      const t1 = (
        insertTicket.get(
          'Add user authentication flow',
          'closed',
          3,
          1,
          'closed'
        ) as { id: number }
      ).id
      const t2 = (
        insertTicket.get(
          'Dashboard loading time is too slow',
          'in_progress',
          2,
          2,
          'in_progress'
        ) as { id: number }
      ).id
      const t3 = (
        insertTicket.get(
          'Fix sidebar navigation on mobile',
          'open',
          2,
          3,
          'open'
        ) as { id: number }
      ).id
      const t4 = (
        insertTicket.get(
          'Add dark mode support',
          'open',
          1,
          4,
          'open'
        ) as { id: number }
      ).id
      const t5 = (
        insertTicket.get(
          'API rate limiting returns wrong status code',
          'in_progress',
          3,
          5,
          'in_progress'
        ) as { id: number }
      ).id
      const t6 = (
        insertTicket.get(
          'Update README with deployment instructions',
          'open',
          0,
          6,
          'open'
        ) as { id: number }
      ).id

      // Label assignments
      const assignLabel = database.prepare(
        'INSERT INTO ticket_labels (ticket_id, label_id, added_by_id) VALUES (?, ?, ?)'
      )
      assignLabel.run(t3, bugLabel.id, 'user-1')
      assignLabel.run(t5, bugLabel.id, 'user-1')
      assignLabel.run(t1, featureLabel.id, 'user-1')
      assignLabel.run(t4, featureLabel.id, 'user-1')
      assignLabel.run(t6, docsLabel.id, 'user-1')

      // User comments
      const insertComment = database.prepare(
        "INSERT INTO comments (ticket_id, author_id, body) VALUES (?, 'user-1', ?)"
      )
      insertComment.run(
        t1,
        'Implemented OAuth2 flow with JWT tokens. All tests passing.'
      )
      insertComment.run(
        t2,
        'Profiled the main dashboard query — the N+1 on project labels is the bottleneck.'
      )
      insertComment.run(
        t2,
        'Switched to a single JOIN query, load time dropped from 1.2s to 180ms.'
      )
      insertComment.run(
        t5,
        'Confirmed: the rate limiter returns 403 instead of 429. Looks like the middleware checks auth before rate limits.'
      )
    }

    // --- Version 2: agent profiles + agent-authored comments ---
    if (seedVersion < 2) {
      // Repair stale docs.db: slug was missing before it was added to the INSERT
      database
        .prepare(`UPDATE projects SET slug = 'acme-project' WHERE id = ? AND slug IS NULL`)
        .run(DEMO_PROJECT_ID)

      // Agent profiles for multi-agent conversation demo
      database.prepare(`
        INSERT OR IGNORE INTO profiles (id, type, name, description, avatar_url)
        VALUES (?, ?, ?, ?, ?)
      `).run('demo-analyzer', 'agent', 'Ticket Analyzer', 'Investigates codebase to find root cause and impact of issues', 'search')
      database.prepare(`
        INSERT OR IGNORE INTO profiles (id, type, name, description, avatar_url)
        VALUES (?, ?, ?, ?, ?)
      `).run('demo-coder', 'agent', 'Coding Agent', 'Implements features and fixes', 'code')

      // Agent-authored comments on ticket 5
      const t5Row = database
        .prepare('SELECT id FROM tickets WHERE project_id = ? AND ticket_number = 5')
        .get(DEMO_PROJECT_ID) as { id: number } | undefined

      if (t5Row) {
        const t5 = t5Row.id
        const hasAnalyzerComment = database
          .prepare('SELECT 1 FROM comments WHERE ticket_id = ? AND author_id = ?')
          .get(t5, 'demo-analyzer')

        if (!hasAnalyzerComment) {
          database.prepare(
            'INSERT INTO comments (ticket_id, author_id, body) VALUES (?, ?, ?)'
          ).run(t5, 'demo-analyzer',
            'Investigated the rate limiting middleware. The auth check at line 42 runs before the rate limiter at line 58, so an invalid token triggers a 403 before the rate limiter can return 429. Swapping the middleware order fixes this.')

          database.prepare(
            "INSERT INTO comments (ticket_id, author_id, body) VALUES (?, 'user-1', ?)"
          ).run(t5,
            'Makes sense — the rate limiter should run first regardless of auth status.')

          database.prepare(
            'INSERT INTO comments (ticket_id, author_id, body) VALUES (?, ?, ?)'
          ).run(t5, 'demo-coder',
            'Fixed the middleware ordering in api-middleware.ts. Rate limiter now runs at priority 1 (before auth at priority 2). Added a test to verify 429 is returned for rate-limited requests regardless of auth status.')
        }
      }
    }

    // --- Version 3: agents, sessions, and permission events (for agent-permissions screenshots) ---
    if (seedVersion < 3) {
      // Agent entries (required for sessions FK + permission screenshots)
      database.prepare(`
        INSERT OR IGNORE INTO agents (id, system_prompt, permissions, config, is_enabled, project_id)
        VALUES (?, ?, ?, ?, 1, ?)
      `).run(
        'demo-analyzer',
        'You are a ticket analyzer agent. Investigate issues and find root causes.',
        JSON.stringify([
          { type: 'resource', resource: 'ticket', actions: ['read'], scope: 'project' },
          { type: 'resource', resource: 'comment', actions: ['read', 'create'], scope: 'project' },
          { type: 'tool', tool: 'Bash', scope: 'invocation' },
          { type: 'tool', tool: 'Read', scope: 'project' },
        ]),
        JSON.stringify({ type: 'kombuse' }),
        DEMO_PROJECT_ID
      )
      database.prepare(`
        INSERT OR IGNORE INTO agents (id, system_prompt, permissions, config, is_enabled, project_id)
        VALUES (?, ?, ?, ?, 1, ?)
      `).run(
        'demo-coder',
        'You are a coding agent. Implement features and fixes.',
        JSON.stringify([
          { type: 'resource', resource: '*', actions: ['read', 'create', 'update'], scope: 'project' },
          { type: 'tool', tool: '*', scope: 'project' },
        ]),
        JSON.stringify({ type: 'kombuse' }),
        DEMO_PROJECT_ID
      )

      // Session for permission event demo (linked to ticket 5)
      const demoSessionId = '00000000-0000-4000-b000-000000000001'
      const demoKombuseSessionId = 'trigger-00000000-0000-4000-b000-000000000002'

      const t5Row = database
        .prepare('SELECT id FROM tickets WHERE project_id = ? AND ticket_number = 5')
        .get(DEMO_PROJECT_ID) as { id: number } | undefined

      if (t5Row) {
        database.prepare(`
          INSERT OR IGNORE INTO sessions (
            id, kombuse_session_id, backend_type, ticket_id, agent_id,
            project_id, status, metadata, started_at, completed_at, last_event_seq
          ) VALUES (?, ?, 'claude-code', ?, 'demo-analyzer', ?, 'completed', '{}',
            datetime('now', '-2 hours'), datetime('now', '-1 hour'), 8)
        `).run(demoSessionId, demoKombuseSessionId, t5Row.id, DEMO_PROJECT_ID)

        // Permission events (request/response pairs with varied tools and behaviors)
        const insertEvent = database.prepare(`
          INSERT OR IGNORE INTO session_events (session_id, seq, event_type, payload, kombuse_session_id)
          VALUES (?, ?, ?, ?, ?)
        `)
        const baseTs = Date.now() - 7200000 // 2 hours ago

        // 1. Bash — allowed
        insertEvent.run(demoSessionId, 1, 'permission_request', JSON.stringify({
          type: 'permission_request', eventId: 'evt-perm-001', backend: 'claude-code',
          timestamp: baseTs, requestId: 'req-001', toolName: 'Bash', toolUseId: 'tu-001',
          input: { command: 'git log --oneline -5', description: 'View recent commits' },
          description: 'Run git log to check recent commits',
        }), demoKombuseSessionId)
        insertEvent.run(demoSessionId, 2, 'permission_response', JSON.stringify({
          type: 'permission_response', eventId: 'evt-perm-002', backend: 'claude-code',
          timestamp: baseTs + 5000, requestId: 'req-001', behavior: 'allow',
        }), demoKombuseSessionId)

        // 2. Read — auto-approved
        insertEvent.run(demoSessionId, 3, 'permission_request', JSON.stringify({
          type: 'permission_request', eventId: 'evt-perm-003', backend: 'claude-code',
          timestamp: baseTs + 10000, requestId: 'req-002', toolName: 'Read', toolUseId: 'tu-002',
          input: { file_path: 'src/middleware/rate-limiter.ts' },
          description: 'Read rate limiter source file',
          autoApproved: true,
        }), demoKombuseSessionId)

        // 3. Edit — allowed
        insertEvent.run(demoSessionId, 5, 'permission_request', JSON.stringify({
          type: 'permission_request', eventId: 'evt-perm-005', backend: 'claude-code',
          timestamp: baseTs + 60000, requestId: 'req-003', toolName: 'Edit', toolUseId: 'tu-003',
          input: { file_path: 'src/middleware/api-middleware.ts', description: 'Swap middleware ordering' },
          description: 'Edit api-middleware.ts to fix middleware ordering',
        }), demoKombuseSessionId)
        insertEvent.run(demoSessionId, 6, 'permission_response', JSON.stringify({
          type: 'permission_response', eventId: 'evt-perm-006', backend: 'claude-code',
          timestamp: baseTs + 65000, requestId: 'req-003', behavior: 'allow',
        }), demoKombuseSessionId)

        // 4. Bash — denied with message
        insertEvent.run(demoSessionId, 7, 'permission_request', JSON.stringify({
          type: 'permission_request', eventId: 'evt-perm-007', backend: 'claude-code',
          timestamp: baseTs + 120000, requestId: 'req-004', toolName: 'Bash', toolUseId: 'tu-004',
          input: { command: 'bun test src/middleware/', description: 'Run middleware tests' },
          description: 'Run middleware test suite',
        }), demoKombuseSessionId)
        insertEvent.run(demoSessionId, 8, 'permission_response', JSON.stringify({
          type: 'permission_response', eventId: 'evt-perm-008', backend: 'claude-code',
          timestamp: baseTs + 130000, requestId: 'req-004', behavior: 'deny',
          message: 'Run only the specific rate-limiter test, not the entire middleware suite',
        }), demoKombuseSessionId)
      }
    }

    // --- Version 4: milestones, agent triggers, mixed statuses, invocations ---
    if (seedVersion < 4) {
      // Milestones
      const m1 = (database.prepare(`
        INSERT INTO milestones (project_id, title, description, due_date, status)
        VALUES (?, 'v1.0 Release', 'Track all features and fixes for the 1.0 release', '2026-04-15', 'open')
        RETURNING id
      `).get(DEMO_PROJECT_ID) as { id: number }).id

      database.prepare(`
        INSERT INTO milestones (project_id, title, description, due_date, status)
        VALUES (?, 'Beta Launch', 'Initial beta release milestones', '2026-02-01', 'closed')
      `).run(DEMO_PROJECT_ID)

      // Assign open tickets 3 and 4 to the v1.0 Release milestone
      database.prepare(`
        UPDATE tickets SET milestone_id = ? WHERE project_id = ? AND ticket_number IN (3, 4)
      `).run(m1, DEMO_PROJECT_ID)

      // Agent triggers
      const trigger1 = (database.prepare(`
        INSERT INTO agent_triggers (agent_id, event_type, project_id, conditions, is_enabled, priority)
        VALUES ('demo-analyzer', 'ticket.updated', ?, '{"status":"open"}', 1, 0)
        RETURNING id
      `).get(DEMO_PROJECT_ID) as { id: number }).id

      const trigger2 = (database.prepare(`
        INSERT INTO agent_triggers (agent_id, event_type, project_id, conditions, is_enabled, priority)
        VALUES ('demo-coder', 'mention.created', ?, NULL, 1, 0)
        RETURNING id
      `).get(DEMO_PROJECT_ID) as { id: number }).id

      // Mixed ticket statuses — set ticket 3 to blocked
      database.prepare(`
        UPDATE tickets SET status = 'blocked' WHERE project_id = ? AND ticket_number = 3
      `).run(DEMO_PROJECT_ID)

      // Agent invocations (linked to existing session and ticket 5)
      const t5 = database
        .prepare('SELECT id FROM tickets WHERE project_id = ? AND ticket_number = 5')
        .get(DEMO_PROJECT_ID) as { id: number } | undefined

      if (t5) {
        const existingSessionId = '00000000-0000-4000-b000-000000000001'

        database.prepare(`
          INSERT INTO agent_invocations (
            agent_id, trigger_id, session_id, project_id, status,
            attempts, max_attempts, run_at, context, result,
            started_at, completed_at, ticket_id
          ) VALUES (
            'demo-analyzer', ?, ?, ?, 'completed',
            1, 3, datetime('now', '-2 hours'), ?, ?,
            datetime('now', '-2 hours'), datetime('now', '-1 hour'), ?
          )
        `).run(
          trigger1, existingSessionId, DEMO_PROJECT_ID,
          JSON.stringify({ ticket_number: 5, event: 'ticket.updated' }),
          JSON.stringify({ summary: 'Middleware ordering issue identified' }),
          t5.id
        )

        database.prepare(`
          INSERT INTO agent_invocations (
            agent_id, trigger_id, session_id, project_id, status,
            attempts, max_attempts, run_at, context, result,
            started_at, completed_at, ticket_id
          ) VALUES (
            'demo-coder', ?, ?, ?, 'completed',
            1, 3, datetime('now', '-90 minutes'), ?, ?,
            datetime('now', '-90 minutes'), datetime('now', '-1 hour'), ?
          )
        `).run(
          trigger2, existingSessionId, DEMO_PROJECT_ID,
          JSON.stringify({ ticket_number: 5, event: 'mention.created' }),
          JSON.stringify({ summary: 'Fixed middleware ordering in api-middleware.ts' }),
          t5.id
        )
      }
    }

    database.pragma(`user_version = ${CURRENT_SEED_VERSION}`)
  })

  seed()
}
