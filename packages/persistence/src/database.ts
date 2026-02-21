import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'
import { join, resolve } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { loadKombuseConfig, getKombuseDir, resolveDbPath } from './config'
import { toSlug, ANONYMOUS_AGENT_ID } from '@kombuse/types'

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
      if ('sql' in migration) {
        db.exec(migration.sql)
      } else {
        migration.run(db)
      }
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name)
    }
  }
}

type Migration =
  | { name: string; sql: string }
  | { name: string; run: (db: DatabaseType) => void }

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
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_profiles_type ON profiles(type);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_external ON profiles(external_source, external_id)
        WHERE external_source IS NOT NULL;

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
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_local_path
        ON projects(local_path) WHERE local_path IS NOT NULL;

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
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_labels_project ON labels(project_id);

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

      -- 16. agents
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
        system_prompt TEXT NOT NULL,
        permissions TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(permissions)),
        config TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config)),
        is_enabled INTEGER NOT NULL DEFAULT 1,
        slug TEXT,
        plugin_id TEXT REFERENCES plugins(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_slug ON agents(slug) WHERE slug IS NOT NULL;

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
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_agent_triggers_event ON agent_triggers(event_type, is_enabled);
      CREATE INDEX IF NOT EXISTS idx_agent_triggers_agent ON agent_triggers(agent_id);

      -- 18. agent_invocations
      CREATE TABLE IF NOT EXISTS agent_invocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        trigger_id INTEGER NOT NULL REFERENCES agent_triggers(id) ON DELETE CASCADE,
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
        kombuse_session_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_agent ON agent_invocations(agent_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_status ON agent_invocations(status);
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_run_at ON agent_invocations(status, run_at);
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_session ON agent_invocations(session_id);
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_kombuse_session
        ON agent_invocations(kombuse_session_id);
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_project
        ON agent_invocations(project_id) WHERE project_id IS NOT NULL;

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

      -- 20. tickets_fts (full-text search)
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

      -- 21. comments_fts (full-text search)
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
    name: '002_profiles_slug',
    sql: `
      ALTER TABLE profiles ADD COLUMN slug TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_slug ON profiles(slug) WHERE slug IS NOT NULL;
      UPDATE profiles SET slug = (SELECT slug FROM agents WHERE agents.id = profiles.id) WHERE type = 'agent';
    `,
  },
  {
    name: '003_agents_plugin_base',
    sql: `
      ALTER TABLE agents ADD COLUMN plugin_base TEXT DEFAULT NULL CHECK (plugin_base IS NULL OR json_valid(plugin_base));
    `,
  },
  {
    name: '004_plugin_scoped_slugs',
    run: (db: DatabaseType) => {
      // Temporarily disable FK checks for bulk reassignment
      db.pragma('foreign_keys = OFF')

      // 2a. Merge orphaned agent profiles into their active counterparts.
      // Orphans are agent-type profiles with no corresponding agents row.
      const orphans = db.prepare(`
        SELECT p.id AS orphan_id, p.name,
          (SELECT p2.id FROM profiles p2
           JOIN agents a ON a.id = p2.id
           WHERE p2.name = p.name AND p2.type = 'agent'
           LIMIT 1) AS target_id
        FROM profiles p
        WHERE p.type = 'agent'
          AND p.id != ?
          AND NOT EXISTS (SELECT 1 FROM agents WHERE agents.id = p.id)
      `).all(ANONYMOUS_AGENT_ID) as { orphan_id: string; name: string; target_id: string | null }[]

      for (const { orphan_id, target_id } of orphans) {
        if (!target_id) continue
        db.prepare('UPDATE comments SET author_id = ? WHERE author_id = ?').run(target_id, orphan_id)
        db.prepare('UPDATE events SET actor_id = ? WHERE actor_id = ?').run(target_id, orphan_id)
        db.prepare('UPDATE ticket_labels SET added_by_id = ? WHERE added_by_id = ?').run(target_id, orphan_id)
        db.prepare('UPDATE mentions SET mentioned_profile_id = ? WHERE mentioned_profile_id = ?').run(target_id, orphan_id)
        db.prepare('UPDATE tickets SET author_id = ? WHERE author_id = ?').run(target_id, orphan_id)
        db.prepare('UPDATE tickets SET assignee_id = ? WHERE assignee_id = ?').run(target_id, orphan_id)
        db.prepare('UPDATE tickets SET claimed_by_id = ? WHERE claimed_by_id = ?').run(target_id, orphan_id)
        db.prepare('DELETE FROM profiles WHERE id = ?').run(orphan_id)
      }

      // 2b. Add plugin_id to profiles and backfill from agents table.
      db.exec(`ALTER TABLE profiles ADD COLUMN plugin_id TEXT REFERENCES plugins(id) ON DELETE SET NULL`)
      db.exec(`
        UPDATE profiles SET plugin_id = (
          SELECT plugin_id FROM agents WHERE agents.id = profiles.id
        ) WHERE type = 'agent' AND EXISTS (
          SELECT 1 FROM agents WHERE agents.id = profiles.id
        )
      `)

      // 2c. Replace global slug indexes with composite (slug, plugin_id) indexes.
      // Two indexes per table: one for plugin-scoped, one for non-plugin (global).
      db.exec(`
        DROP INDEX IF EXISTS idx_agents_slug;
        CREATE UNIQUE INDEX idx_agents_slug_plugin ON agents(slug, plugin_id)
          WHERE slug IS NOT NULL AND plugin_id IS NOT NULL;
        CREATE UNIQUE INDEX idx_agents_slug_global ON agents(slug)
          WHERE slug IS NOT NULL AND plugin_id IS NULL;

        DROP INDEX IF EXISTS idx_profiles_slug;
        CREATE UNIQUE INDEX idx_profiles_slug_plugin ON profiles(slug, plugin_id)
          WHERE slug IS NOT NULL AND plugin_id IS NOT NULL;
        CREATE UNIQUE INDEX idx_profiles_slug_global ON profiles(slug)
          WHERE slug IS NOT NULL AND plugin_id IS NULL;
      `)

      // 2d. Add slug column to labels and backfill from name.
      db.exec(`ALTER TABLE labels ADD COLUMN slug TEXT`)

      const labels = db.prepare('SELECT id, name FROM labels').all() as { id: number; name: string }[]
      const updateSlug = db.prepare('UPDATE labels SET slug = ? WHERE id = ?')
      for (const label of labels) {
        updateSlug.run(toSlug(label.name), label.id)
      }

      db.exec(`
        CREATE UNIQUE INDEX idx_labels_slug_plugin ON labels(slug, plugin_id, project_id)
          WHERE slug IS NOT NULL AND plugin_id IS NOT NULL;
        CREATE UNIQUE INDEX idx_labels_slug_global ON labels(slug, project_id)
          WHERE slug IS NOT NULL AND plugin_id IS NULL;
      `)

      // Re-enable FK checks
      db.pragma('foreign_keys = ON')
    },
  },
  {
    name: '005_trigger_slugs',
    run: (db: DatabaseType) => {
      // 1. Add slug column to agent_triggers
      db.exec(`ALTER TABLE agent_triggers ADD COLUMN slug TEXT`)

      // 2. Backfill: derive slug from event_type, dedup within same agent
      const triggers = db.prepare(
        'SELECT id, agent_id, event_type FROM agent_triggers ORDER BY agent_id, id'
      ).all() as { id: number; agent_id: string; event_type: string }[]

      const slugCountByAgent = new Map<string, Map<string, number>>()
      const updateSlug = db.prepare('UPDATE agent_triggers SET slug = ? WHERE id = ?')

      for (const trigger of triggers) {
        let agentSlugs = slugCountByAgent.get(trigger.agent_id)
        if (!agentSlugs) {
          agentSlugs = new Map()
          slugCountByAgent.set(trigger.agent_id, agentSlugs)
        }

        const baseSlug = toSlug(trigger.event_type)
        const count = (agentSlugs.get(baseSlug) ?? 0) + 1
        agentSlugs.set(baseSlug, count)

        const finalSlug = count === 1 ? baseSlug : `${baseSlug}-${count}`
        updateSlug.run(finalSlug, trigger.id)
      }

      // 3. Create composite unique indexes (dual-index pattern for NULL plugin_id)
      db.exec(`
        CREATE UNIQUE INDEX idx_agent_triggers_slug_plugin
          ON agent_triggers(slug, agent_id, plugin_id)
          WHERE slug IS NOT NULL AND plugin_id IS NOT NULL;
        CREATE UNIQUE INDEX idx_agent_triggers_slug_global
          ON agent_triggers(slug, agent_id)
          WHERE slug IS NOT NULL AND plugin_id IS NULL;
      `)
    },
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
