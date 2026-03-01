import type {
  Agent,
  AgentFilters,
  CreateAgentInput,
  UpdateAgentInput,
  AgentTrigger,
  CreateAgentTriggerInput,
  UpdateAgentTriggerInput,
  AgentInvocation,
  AgentInvocationFilters,
  CreateAgentInvocationInput,
  UpdateAgentInvocationInput,
  Permission,
  AgentConfig,
  PluginBase,
} from '@kombuse/types'
import { getDatabase } from './database'

/**
 * Data access layer for agents
 */
export const agentsRepository = {
  /**
   * List all agents with optional filters
   */
  list(filters?: AgentFilters): Agent[] {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.project_id) {
      conditions.push('(project_id = ? OR project_id IS NULL)')
      params.push(filters.project_id)
    }

    if (filters?.is_enabled !== undefined) {
      conditions.push('is_enabled = ?')
      params.push(filters.is_enabled ? 1 : 0)
    }

    if (filters?.enabled_for_chat !== undefined) {
      conditions.push("json_extract(config, '$.enabled_for_chat') = ?")
      params.push(filters.enabled_for_chat ? 1 : 0)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const limit = filters?.limit || 100
    const offset = filters?.offset || 0

    const stmt = db.prepare(`
      SELECT * FROM agents
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `)

    const rows = stmt.all(...params, limit, offset) as RawAgent[]
    return rows.map(mapAgent)
  },

  /**
   * Get a single agent by ID
   */
  get(id: string): Agent | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM agents WHERE id = ?')
      .get(id) as RawAgent | undefined
    return row ? mapAgent(row) : null
  },

  /**
   * Get a single agent by slug (returns first match)
   */
  getBySlug(slug: string): Agent | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM agents WHERE slug = ?')
      .get(slug) as RawAgent | undefined
    return row ? mapAgent(row) : null
  },

  /**
   * Get an agent by slug scoped to a specific plugin
   */
  getBySlugAndPlugin(slug: string, pluginId: string): Agent | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM agents WHERE slug = ? AND plugin_id = ?')
      .get(slug, pluginId) as RawAgent | undefined
    return row ? mapAgent(row) : null
  },

  /**
   * Get an agent by slug scoped to a specific project (excludes global agents)
   */
  getBySlugAndProject(slug: string, projectId: string): Agent | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM agents WHERE slug = ? AND project_id = ?')
      .get(slug, projectId) as RawAgent | undefined
    return row ? mapAgent(row) : null
  },

  /**
   * Create a new agent
   */
  create(input: CreateAgentInput): Agent {
    const db = getDatabase()

    const row = db.prepare(
      `
      INSERT INTO agents (
        id, slug, system_prompt, permissions, config, is_enabled, plugin_id, project_id, plugin_base
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `
    ).get(
      input.id,
      input.slug ?? null,
      input.system_prompt,
      JSON.stringify(input.permissions ?? []),
      JSON.stringify(input.config ?? {}),
      input.is_enabled !== false ? 1 : 0,
      input.plugin_id ?? null,
      input.project_id ?? null,
      input.plugin_base ? JSON.stringify(input.plugin_base) : null
    ) as RawAgent

    return mapAgent(row)
  },

  /**
   * Update an existing agent
   */
  update(id: string, input: UpdateAgentInput): Agent | null {
    const db = getDatabase()

    const fields: string[] = []
    const params: unknown[] = []

    if (input.system_prompt !== undefined) {
      fields.push('system_prompt = ?')
      params.push(input.system_prompt)
    }
    if (input.permissions !== undefined) {
      fields.push('permissions = ?')
      params.push(JSON.stringify(input.permissions))
    }
    if (input.config !== undefined) {
      fields.push('config = ?')
      params.push(JSON.stringify(input.config))
    }
    if (input.is_enabled !== undefined) {
      fields.push('is_enabled = ?')
      params.push(input.is_enabled ? 1 : 0)
    }
    if (input.plugin_id !== undefined) {
      fields.push('plugin_id = ?')
      params.push(input.plugin_id)
    }
    if (input.project_id !== undefined) {
      fields.push('project_id = ?')
      params.push(input.project_id)
    }
    if (input.plugin_base !== undefined) {
      fields.push('plugin_base = ?')
      params.push(input.plugin_base ? JSON.stringify(input.plugin_base) : null)
    }

    if (fields.length === 0) return this.get(id)

    fields.push("updated_at = datetime('now')")
    params.push(id)

    const row = db.prepare(`UPDATE agents SET ${fields.join(', ')} WHERE id = ? RETURNING *`).get(
      ...params
    ) as RawAgent | undefined
    return row ? mapAgent(row) : null
  },

  /**
   * Delete an agent
   */
  delete(id: string): boolean {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM agents WHERE id = ?').run(id)
    return result.changes > 0
  },

  resetToPluginBase(id: string): Agent | null {
    const agent = this.get(id)
    if (!agent || !agent.plugin_base) return null

    const db = getDatabase()
    const row = db.prepare(`
      UPDATE agents SET
        system_prompt = ?,
        permissions = ?,
        config = ?,
        is_enabled = ?,
        updated_at = datetime('now')
      WHERE id = ?
      RETURNING *
    `).get(
      agent.plugin_base.system_prompt,
      JSON.stringify(agent.plugin_base.permissions),
      JSON.stringify(agent.plugin_base.config),
      agent.plugin_base.is_enabled ? 1 : 0,
      id
    ) as RawAgent | undefined
    return row ? mapAgent(row) : null
  },

  enableByPlugin(pluginId: string): void {
    const db = getDatabase()
    db.prepare("UPDATE agents SET is_enabled = 1, updated_at = datetime('now') WHERE plugin_id = ?").run(pluginId)
  },

  disableByPlugin(pluginId: string): void {
    const db = getDatabase()
    db.prepare("UPDATE agents SET is_enabled = 0, updated_at = datetime('now') WHERE plugin_id = ?").run(pluginId)
  },

  orphanByPlugin(pluginId: string): void {
    const db = getDatabase()
    db.prepare("UPDATE agents SET plugin_id = NULL, updated_at = datetime('now') WHERE plugin_id = ?").run(pluginId)
  },

  listIdsByPlugin(pluginId: string): string[] {
    const db = getDatabase()
    const rows = db.prepare('SELECT id FROM agents WHERE plugin_id = ?').all(pluginId) as { id: string }[]
    return rows.map((r) => r.id)
  },
}

/**
 * Data access layer for agent triggers
 */
export const agentTriggersRepository = {
  /**
   * List triggers for an agent
   */
  listByAgent(agentId: string): AgentTrigger[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        'SELECT * FROM agent_triggers WHERE agent_id = ? ORDER BY priority DESC, created_at DESC'
      )
      .all(agentId) as RawAgentTrigger[]
    return rows.map(mapAgentTrigger)
  },

  /**
   * List enabled triggers for a given event type
   */
  listByEventType(eventType: string, projectId?: string): AgentTrigger[] {
    const db = getDatabase()

    // Match triggers that either have no project_id (global) or match the given project
    const rows = db
      .prepare(
        `
        SELECT * FROM agent_triggers
        WHERE event_type = ?
          AND is_enabled = 1
          AND (project_id IS NULL OR project_id = ?)
        ORDER BY priority DESC, created_at DESC
      `
      )
      .all(eventType, projectId ?? null) as RawAgentTrigger[]

    return rows.map(mapAgentTrigger)
  },

  /**
   * Get a single trigger by ID
   */
  get(id: number): AgentTrigger | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM agent_triggers WHERE id = ?')
      .get(id) as RawAgentTrigger | undefined
    return row ? mapAgentTrigger(row) : null
  },

  getBySlugAndAgent(slug: string, agentId: string, pluginId: string | null): AgentTrigger | null {
    const db = getDatabase()
    const row = pluginId
      ? db
          .prepare('SELECT * FROM agent_triggers WHERE slug = ? AND agent_id = ? AND plugin_id = ?')
          .get(slug, agentId, pluginId) as RawAgentTrigger | undefined
      : db
          .prepare('SELECT * FROM agent_triggers WHERE slug = ? AND agent_id = ? AND plugin_id IS NULL')
          .get(slug, agentId) as RawAgentTrigger | undefined
    return row ? mapAgentTrigger(row) : null
  },

  listByAgentAndPlugin(agentId: string, pluginId: string): AgentTrigger[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        'SELECT * FROM agent_triggers WHERE agent_id = ? AND plugin_id = ? ORDER BY priority DESC, created_at DESC'
      )
      .all(agentId, pluginId) as RawAgentTrigger[]
    return rows.map(mapAgentTrigger)
  },

  /**
   * Create a new trigger
   */
  create(input: CreateAgentTriggerInput): AgentTrigger {
    const db = getDatabase()

    const row = db
      .prepare(
        `
      INSERT INTO agent_triggers (
        agent_id, event_type, slug, project_id, conditions, is_enabled, priority, plugin_id, allowed_invokers
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `
      )
      .get(
        input.agent_id,
        input.event_type,
        input.slug ?? null,
        input.project_id ?? null,
        input.conditions ? JSON.stringify(input.conditions) : null,
        input.is_enabled !== false ? 1 : 0,
        input.priority ?? 0,
        input.plugin_id ?? null,
        input.allowed_invokers ? JSON.stringify(input.allowed_invokers) : null
      ) as RawAgentTrigger

    return mapAgentTrigger(row)
  },

  /**
   * Update an existing trigger
   */
  update(id: number, input: UpdateAgentTriggerInput): AgentTrigger | null {
    const db = getDatabase()

    const fields: string[] = []
    const params: unknown[] = []

    if (input.event_type !== undefined) {
      fields.push('event_type = ?')
      params.push(input.event_type)
    }
    if (input.project_id !== undefined) {
      fields.push('project_id = ?')
      params.push(input.project_id)
    }
    if (input.conditions !== undefined) {
      fields.push('conditions = ?')
      params.push(input.conditions ? JSON.stringify(input.conditions) : null)
    }
    if (input.is_enabled !== undefined) {
      fields.push('is_enabled = ?')
      params.push(input.is_enabled ? 1 : 0)
    }
    if (input.priority !== undefined) {
      fields.push('priority = ?')
      params.push(input.priority)
    }
    if (input.plugin_id !== undefined) {
      fields.push('plugin_id = ?')
      params.push(input.plugin_id)
    }
    if (input.allowed_invokers !== undefined) {
      fields.push('allowed_invokers = ?')
      params.push(
        input.allowed_invokers ? JSON.stringify(input.allowed_invokers) : null
      )
    }

    if (fields.length === 0) return this.get(id)

    fields.push("updated_at = datetime('now')")
    params.push(id)

    const row = db.prepare(
      `UPDATE agent_triggers SET ${fields.join(', ')} WHERE id = ? RETURNING *`
    ).get(...params) as RawAgentTrigger | undefined
    return row ? mapAgentTrigger(row) : null
  },

  /**
   * Delete a trigger
   */
  delete(id: number): boolean {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM agent_triggers WHERE id = ?').run(id)
    return result.changes > 0
  },

  /**
   * List triggers whose conditions contain a matching label_id
   */
  listByLabelId(labelId: number): AgentTrigger[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT * FROM agent_triggers
         WHERE json_extract(conditions, '$.label_id') = ?
         ORDER BY created_at DESC`
      )
      .all(labelId) as RawAgentTrigger[]
    return rows.map(mapAgentTrigger)
  },

  /**
   * List distinct label IDs referenced by enabled triggers.
   * Returns labels that have at least one enabled trigger with a label_id condition.
   */
  listSmartLabelIds(projectId?: string): number[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT DISTINCT CAST(json_extract(conditions, '$.label_id') AS INTEGER) as label_id
         FROM agent_triggers
         WHERE is_enabled = 1
           AND json_extract(conditions, '$.label_id') IS NOT NULL
           AND (project_id IS NULL OR project_id = ?)`
      )
      .all(projectId ?? null) as { label_id: number }[]
    return rows.map((r) => r.label_id)
  },

  enableByPlugin(pluginId: string): void {
    const db = getDatabase()
    db.prepare("UPDATE agent_triggers SET is_enabled = 1, updated_at = datetime('now') WHERE plugin_id = ?").run(pluginId)
  },

  disableByPlugin(pluginId: string): void {
    const db = getDatabase()
    db.prepare("UPDATE agent_triggers SET is_enabled = 0, updated_at = datetime('now') WHERE plugin_id = ?").run(pluginId)
  },

  orphanByPlugin(pluginId: string): void {
    const db = getDatabase()
    db.prepare("UPDATE agent_triggers SET plugin_id = NULL, updated_at = datetime('now') WHERE plugin_id = ?").run(pluginId)
  },
}

/**
 * Data access layer for agent invocations
 */
export const agentInvocationsRepository = {
  /**
   * List invocations with optional filters
   */
  list(filters?: AgentInvocationFilters): AgentInvocation[] {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.agent_id) {
      conditions.push('agent_id = ?')
      params.push(filters.agent_id)
    }
    if (filters?.trigger_id) {
      conditions.push('trigger_id = ?')
      params.push(filters.trigger_id)
    }
    if (filters?.status) {
      conditions.push('status = ?')
      params.push(filters.status)
    }
    if (filters?.session_id) {
      conditions.push('session_id = ?')
      params.push(filters.session_id)
    }
    if (filters?.project_id) {
      conditions.push('project_id = ?')
      params.push(filters.project_id)
    }
    if (filters?.kombuse_session_id) {
      conditions.push('kombuse_session_id = ?')
      params.push(filters.kombuse_session_id)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const limit = filters?.limit || 100
    const offset = filters?.offset || 0

    const stmt = db.prepare(`
      SELECT * FROM agent_invocations
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `)

    const rows = stmt.all(...params, limit, offset) as RawAgentInvocation[]
    return rows.map(mapAgentInvocation)
  },

  /**
   * Get a single invocation by ID
   */
  get(id: number): AgentInvocation | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM agent_invocations WHERE id = ?')
      .get(id) as RawAgentInvocation | undefined
    return row ? mapAgentInvocation(row) : null
  },

  /**
   * Create a new invocation
   */
  create(input: CreateAgentInvocationInput): AgentInvocation {
    const db = getDatabase()
    const ticketId = typeof input.context?.ticket_id === 'number' ? input.context.ticket_id : null

    const row = db
      .prepare(
        `
      INSERT INTO agent_invocations (
        agent_id, trigger_id, event_id, session_id, project_id, ticket_id, max_attempts, run_at, context
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?)
      RETURNING *
    `
      )
      .get(
        input.agent_id,
        input.trigger_id ?? null,
        input.event_id ?? null,
        input.session_id ?? null,
        input.project_id ?? null,
        ticketId,
        input.max_attempts ?? 3,
        input.run_at ?? null,
        JSON.stringify(input.context)
      ) as RawAgentInvocation

    return mapAgentInvocation(row)
  },

  /**
   * Update an existing invocation
   */
  update(id: number, input: UpdateAgentInvocationInput): AgentInvocation | null {
    const db = getDatabase()

    const fields: string[] = []
    const params: unknown[] = []

    if (input.status !== undefined) {
      fields.push('status = ?')
      params.push(input.status)
    }
    if (input.session_id !== undefined) {
      fields.push('session_id = ?')
      params.push(input.session_id)
    }
    if (input.kombuse_session_id !== undefined) {
      fields.push('kombuse_session_id = ?')
      params.push(input.kombuse_session_id)
    }
    if (input.attempts !== undefined) {
      fields.push('attempts = ?')
      params.push(input.attempts)
    }
    if (input.max_attempts !== undefined) {
      fields.push('max_attempts = ?')
      params.push(input.max_attempts)
    }
    if (input.run_at !== undefined) {
      fields.push('run_at = ?')
      params.push(input.run_at)
    }
    if (input.result !== undefined) {
      fields.push('result = ?')
      params.push(JSON.stringify(input.result))
    }
    if (input.error !== undefined) {
      fields.push('error = ?')
      params.push(input.error)
    }
    if (input.started_at !== undefined) {
      fields.push('started_at = ?')
      params.push(input.started_at)
    }
    if (input.completed_at !== undefined) {
      fields.push('completed_at = ?')
      params.push(input.completed_at)
    }

    if (fields.length === 0) return this.get(id)

    params.push(id)

    const row = db.prepare(
      `UPDATE agent_invocations SET ${fields.join(', ')} WHERE id = ? RETURNING *`
    ).get(...params) as RawAgentInvocation | undefined
    return row ? mapAgentInvocation(row) : null
  },

  /**
   * Count recent invocations for a given ticket (via context JSON).
   * Used for chain depth guards to prevent infinite agent loops.
   */
  countRecentByTicketId(ticketId: number, sinceHoursAgo: number = 1): number {
    const db = getDatabase()
    const row = db
      .prepare(
        `SELECT COUNT(*) as count FROM agent_invocations
         LEFT JOIN events ON events.id = agent_invocations.event_id
         WHERE agent_invocations.ticket_id = ?
           AND agent_invocations.created_at >= datetime('now', '-' || ? || ' hours')
           AND (agent_invocations.event_id IS NULL OR events.actor_type != 'user')
           AND (agent_invocations.error IS NULL OR agent_invocations.error NOT LIKE 'Chain depth limit%')`
      )
      .get(ticketId, sinceHoursAgo) as { count: number }
    return row.count
  },

  /**
   * Find an active (pending or running) invocation for a given agent on a given ticket.
   * Used for deduplication guards to prevent concurrent duplicate invocations.
   */
  findActiveByAgentAndTicket(agentId: string, ticketId: number): AgentInvocation | null {
    const db = getDatabase()
    const row = db
      .prepare(
        `SELECT * FROM agent_invocations
         WHERE agent_id = ?
           AND ticket_id = ?
           AND status IN ('pending', 'running')
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(agentId, ticketId) as RawAgentInvocation | undefined
    return row ? mapAgentInvocation(row) : null
  },

  /**
   * Delete an invocation
   */
  delete(id: number): boolean {
    const db = getDatabase()
    const result = db
      .prepare('DELETE FROM agent_invocations WHERE id = ?')
      .run(id)
    return result.changes > 0
  },

  failBySessionId(sessionId: string, error: string): number {
    const db = getDatabase()
    const now = new Date().toISOString()
    const result = db
      .prepare(
        `UPDATE agent_invocations
         SET status = 'failed', error = ?, completed_at = ?
         WHERE session_id = ? AND status IN ('pending', 'running')`
      )
      .run(error, now, sessionId)
    return result.changes
  },
}

// Raw types from database (JSON stored as TEXT, booleans as INTEGER)
interface RawAgent {
  id: string
  slug: string | null
  system_prompt: string
  permissions: string
  config: string
  is_enabled: number
  plugin_id: string | null
  project_id: string | null
  plugin_base: string | null
  created_at: string
  updated_at: string
}

interface RawAgentTrigger {
  id: number
  slug: string | null
  agent_id: string
  event_type: string
  project_id: string | null
  conditions: string | null
  is_enabled: number
  priority: number
  plugin_id: string | null
  allowed_invokers: string | null
  created_at: string
  updated_at: string
}

interface RawAgentInvocation {
  id: number
  agent_id: string
  trigger_id: number | null
  event_id: number | null
  session_id: string | null
  project_id: string | null
  ticket_id: number | null
  kombuse_session_id: string | null
  status: string
  attempts: number
  max_attempts: number
  run_at: string
  context: string
  result: string | null
  error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

// Map database rows to typed entities
function mapAgent(row: RawAgent): Agent {
  return {
    id: row.id,
    slug: row.slug,
    system_prompt: row.system_prompt,
    permissions: JSON.parse(row.permissions) as Permission[],
    config: JSON.parse(row.config) as AgentConfig,
    is_enabled: row.is_enabled === 1,
    plugin_id: row.plugin_id,
    project_id: row.project_id,
    plugin_base: row.plugin_base ? JSON.parse(row.plugin_base) as PluginBase : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function mapAgentTrigger(row: RawAgentTrigger): AgentTrigger {
  return {
    id: row.id,
    slug: row.slug,
    agent_id: row.agent_id,
    event_type: row.event_type,
    project_id: row.project_id,
    conditions: row.conditions ? JSON.parse(row.conditions) : null,
    is_enabled: row.is_enabled === 1,
    priority: row.priority,
    plugin_id: row.plugin_id,
    allowed_invokers: row.allowed_invokers
      ? JSON.parse(row.allowed_invokers)
      : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function mapAgentInvocation(row: RawAgentInvocation): AgentInvocation {
  return {
    id: row.id,
    agent_id: row.agent_id,
    trigger_id: row.trigger_id,
    event_id: row.event_id,
    session_id: row.session_id,
    project_id: row.project_id,
    kombuse_session_id: row.kombuse_session_id,
    status: row.status as AgentInvocation['status'],
    attempts: row.attempts,
    max_attempts: row.max_attempts,
    run_at: row.run_at,
    context: JSON.parse(row.context),
    result: row.result ? JSON.parse(row.result) : null,
    error: row.error,
    started_at: row.started_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
  }
}
