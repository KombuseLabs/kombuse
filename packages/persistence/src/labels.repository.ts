import type {
  ActorType,
  Label,
  LabelFilters,
  CreateLabelInput,
  UpdateLabelInput,
} from '@kombuse/types'
import { EVENT_TYPES, toSlug } from '@kombuse/types'
import { getDatabase } from './database'
import { eventsRepository } from './events.repository'
import { profilesRepository } from './profiles.repository'
import { resolveTicketId } from './resolve-ticket-id'

/**
 * Data access layer for labels
 */
export const labelsRepository = {
  /**
   * List all labels with optional filters
   */
  list(filters?: LabelFilters): Label[] {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.project_id) {
      conditions.push('l.project_id = ?')
      params.push(filters.project_id)
    }
    if (filters?.search) {
      conditions.push('(l.name LIKE ? OR l.description LIKE ?)')
      params.push(`%${filters.search}%`, `%${filters.search}%`)
    }
    if (filters?.is_enabled !== false) {
      conditions.push('l.is_enabled = 1')
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    if (filters?.sort === 'usage') {
      const usageCountSql =
        filters.usage_scope === 'open'
          ? "COUNT(DISTINCT CASE WHEN t.status = 'open' THEN tl.ticket_id END)"
          : 'COUNT(DISTINCT t.id)'

      const stmt = db.prepare(`
        SELECT l.*, ${usageCountSql} AS usage_count
        FROM labels l
        LEFT JOIN ticket_labels tl ON l.id = tl.label_id
        LEFT JOIN tickets t ON t.id = tl.ticket_id AND t.project_id = l.project_id
        ${whereClause}
        GROUP BY l.id
        ORDER BY usage_count DESC, l.name ASC
      `)

      return stmt.all(...params) as Label[]
    }

    const stmt = db.prepare(`
      SELECT l.* FROM labels l
      ${whereClause}
      ORDER BY l.name ASC
    `)

    return stmt.all(...params) as Label[]
  },

  /**
   * Get a single label by ID
   */
  get(id: number): Label | null {
    const db = getDatabase()
    const label = db
      .prepare('SELECT * FROM labels WHERE id = ?')
      .get(id) as Label | undefined
    return label ?? null
  },

  /**
   * Get all labels for a project
   */
  getByProject(projectId: string, includeDisabled = false): Label[] {
    const db = getDatabase()
    const enabledClause = includeDisabled ? '' : ' AND is_enabled = 1'
    return db
      .prepare(`SELECT * FROM labels WHERE project_id = ?${enabledClause} ORDER BY name ASC`)
      .all(projectId) as Label[]
  },

  /**
   * Create a new label
   */
  create(input: CreateLabelInput): Label {
    const db = getDatabase()
    const slug = input.slug ?? toSlug(input.name)

    const result = db
      .prepare(
        `
      INSERT INTO labels (project_id, name, slug, color, description, plugin_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        input.project_id,
        input.name,
        slug,
        input.color ?? '#808080',
        input.description ?? null,
        input.plugin_id ?? null
      )

    return this.get(result.lastInsertRowid as number) as Label
  },

  /**
   * Update an existing label
   */
  /**
   * Get a label by slug scoped to a specific plugin and project
   */
  getBySlugAndPlugin(slug: string, projectId: string, pluginId: string): Label | null {
    const db = getDatabase()
    const label = db
      .prepare('SELECT * FROM labels WHERE slug = ? AND project_id = ? AND plugin_id = ?')
      .get(slug, projectId, pluginId) as Label | undefined
    return label ?? null
  },

  getBySlugAndProject(slug: string, projectId: string): Label | null {
    const db = getDatabase()
    const label = db
      .prepare('SELECT * FROM labels WHERE slug = ? AND project_id = ? AND is_enabled = 1')
      .get(slug, projectId) as Label | undefined
    return label ?? null
  },

  update(id: number, input: UpdateLabelInput): Label | null {
    const db = getDatabase()

    const fields: string[] = []
    const params: unknown[] = []

    if (input.name !== undefined) {
      fields.push('name = ?')
      params.push(input.name)
    }
    if (input.slug !== undefined) {
      fields.push('slug = ?')
      params.push(input.slug)
    }
    if (input.color !== undefined) {
      fields.push('color = ?')
      params.push(input.color)
    }
    if (input.description !== undefined) {
      fields.push('description = ?')
      params.push(input.description)
    }
    if (input.plugin_id !== undefined) {
      fields.push('plugin_id = ?')
      params.push(input.plugin_id)
    }
    if (input.is_enabled !== undefined) {
      fields.push('is_enabled = ?')
      params.push(input.is_enabled ? 1 : 0)
    }

    if (fields.length === 0) return this.get(id)

    params.push(id)

    db.prepare(`UPDATE labels SET ${fields.join(', ')} WHERE id = ?`).run(
      ...params
    )

    return this.get(id)
  },

  /**
   * Delete a label
   */
  delete(id: number): boolean {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM labels WHERE id = ?').run(id)
    return result.changes > 0
  },

  /**
   * Add a label to a ticket
   */
  addToTicket(ticketId: number, labelId: number, addedById?: string): void {
    const db = getDatabase()
    const result = db
      .prepare(
        `
      INSERT OR IGNORE INTO ticket_labels (ticket_id, label_id, added_by_id)
      VALUES (?, ?, ?)
    `
      )
      .run(ticketId, labelId, addedById ?? null)

    // Only emit event if a row was actually inserted
    if (result.changes > 0) {
      const ticket = db
        .prepare('SELECT project_id FROM tickets WHERE id = ?')
        .get(ticketId) as { project_id: string } | undefined

      const label = this.get(labelId)

      const adderProfile = addedById ? profilesRepository.get(addedById) : null
      const adderActorType: ActorType = addedById
        ? (adderProfile?.type === 'agent' ? 'agent' : 'user')
        : 'system'
      eventsRepository.create({
        event_type: EVENT_TYPES.LABEL_ADDED,
        project_id: ticket?.project_id,
        ticket_id: ticketId,
        actor_id: addedById,
        actor_type: adderActorType,
        payload: { label_id: labelId, label_name: label?.name, label_slug: label?.slug, label_plugin_id: label?.plugin_id },
      })
    }
  },

  /**
   * Remove a label from a ticket
   */
  removeFromTicket(ticketId: number, labelId: number, removedById?: string): boolean {
    const db = getDatabase()

    // Look up label name before deletion for the event payload
    const label = this.get(labelId)

    const result = db
      .prepare('DELETE FROM ticket_labels WHERE ticket_id = ? AND label_id = ?')
      .run(ticketId, labelId)

    // Only emit event if a row was actually deleted
    if (result.changes > 0) {
      const ticket = db
        .prepare('SELECT project_id FROM tickets WHERE id = ?')
        .get(ticketId) as { project_id: string } | undefined

      const removerProfile = removedById ? profilesRepository.get(removedById) : null
      const removerActorType: ActorType = removedById
        ? (removerProfile?.type === 'agent' ? 'agent' : 'user')
        : 'system'
      eventsRepository.create({
        event_type: EVENT_TYPES.LABEL_REMOVED,
        project_id: ticket?.project_id,
        ticket_id: ticketId,
        actor_id: removedById,
        actor_type: removerActorType,
        payload: { label_id: labelId, label_name: label?.name, label_slug: label?.slug, label_plugin_id: label?.plugin_id },
      })
    }

    return result.changes > 0
  },

  /**
   * Get all labels for a ticket
   */
  getTicketLabels(ticketId: number): Label[] {
    const db = getDatabase()
    return db
      .prepare(
        `
        SELECT l.*
        FROM labels l
        JOIN ticket_labels tl ON l.id = tl.label_id
        WHERE tl.ticket_id = ?
        ORDER BY l.name ASC
      `
      )
      .all(ticketId) as Label[]
  },

  /**
   * Get all labels for multiple tickets (batch operation)
   * Returns a Map of ticketId -> Label[]
   */
  getLabelsForTickets(ticketIds: number[]): Map<number, Label[]> {
    if (ticketIds.length === 0) return new Map()

    const db = getDatabase()
    const placeholders = ticketIds.map(() => '?').join(', ')

    const rows = db
      .prepare(
        `
        SELECT l.*, tl.ticket_id
        FROM labels l
        JOIN ticket_labels tl ON l.id = tl.label_id
        WHERE tl.ticket_id IN (${placeholders})
        ORDER BY l.name ASC
      `
      )
      .all(...ticketIds) as (Label & { ticket_id: number })[]

    const labelsByTicket = new Map<number, Label[]>()
    for (const ticketId of ticketIds) {
      labelsByTicket.set(ticketId, [])
    }
    for (const row of rows) {
      const { ticket_id, ...label } = row
      labelsByTicket.get(ticket_id)?.push(label as Label)
    }
    return labelsByTicket
  },

  /**
   * Remap ticket-label associations from one label to another.
   * Transfers ticket_labels rows from oldLabelId to newLabelId,
   * skipping tickets that already have the new label to avoid duplicates.
   * Returns the number of rows remapped.
   */
  remapTicketLabels(oldLabelId: number, newLabelId: number): number {
    const db = getDatabase()
    // Step A: Remap rows that won't create a duplicate
    const remapped = db
      .prepare(
        `UPDATE ticket_labels SET label_id = ?
         WHERE label_id = ?
         AND ticket_id NOT IN (SELECT ticket_id FROM ticket_labels WHERE label_id = ?)`
      )
      .run(newLabelId, oldLabelId, newLabelId)

    // Step B: Clean up remaining rows (tickets that already had the new label)
    db.prepare('DELETE FROM ticket_labels WHERE label_id = ?').run(oldLabelId)

    return remapped.changes
  },

  /**
   * Get all tickets with a specific label
   */
  getTicketIds(labelId: number): number[] {
    const db = getDatabase()
    const rows = db
      .prepare('SELECT ticket_id FROM ticket_labels WHERE label_id = ?')
      .all(labelId) as { ticket_id: number }[]
    return rows.map((r) => r.ticket_id)
  },

  addToTicketByNumber(projectId: string, ticketNumber: number, labelId: number, addedById?: string): void {
    const ticketId = resolveTicketId(projectId, ticketNumber)
    const db = getDatabase()
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO ticket_labels (ticket_id, label_id, added_by_id)
         VALUES (?, ?, ?)`
      )
      .run(ticketId, labelId, addedById ?? null)

    if (result.changes > 0) {
      const label = this.get(labelId)
      const adderProfile = addedById ? profilesRepository.get(addedById) : null
      const adderActorType: ActorType = addedById
        ? (adderProfile?.type === 'agent' ? 'agent' : 'user')
        : 'system'
      eventsRepository.create({
        event_type: EVENT_TYPES.LABEL_ADDED,
        project_id: projectId,
        ticket_id: ticketId,
        actor_id: addedById,
        actor_type: adderActorType,
        payload: { label_id: labelId, label_name: label?.name, label_slug: label?.slug, label_plugin_id: label?.plugin_id },
      })
    }
  },

  removeFromTicketByNumber(projectId: string, ticketNumber: number, labelId: number, removedById?: string): boolean {
    const ticketId = resolveTicketId(projectId, ticketNumber)
    const db = getDatabase()

    const label = this.get(labelId)

    const result = db
      .prepare('DELETE FROM ticket_labels WHERE ticket_id = ? AND label_id = ?')
      .run(ticketId, labelId)

    if (result.changes > 0) {
      const removerProfile = removedById ? profilesRepository.get(removedById) : null
      const removerActorType: ActorType = removedById
        ? (removerProfile?.type === 'agent' ? 'agent' : 'user')
        : 'system'
      eventsRepository.create({
        event_type: EVENT_TYPES.LABEL_REMOVED,
        project_id: projectId,
        ticket_id: ticketId,
        actor_id: removedById,
        actor_type: removerActorType,
        payload: { label_id: labelId, label_name: label?.name, label_slug: label?.slug, label_plugin_id: label?.plugin_id },
      })
    }

    return result.changes > 0
  },

  getTicketLabelsByNumber(projectId: string, ticketNumber: number): Label[] {
    const ticketId = resolveTicketId(projectId, ticketNumber)
    return this.getTicketLabels(ticketId)
  },

  enableByPlugin(pluginId: string): void {
    const db = getDatabase()
    db.prepare('UPDATE labels SET is_enabled = 1 WHERE plugin_id = ?').run(pluginId)
  },

  disableByPlugin(pluginId: string): void {
    const db = getDatabase()
    db.prepare('UPDATE labels SET is_enabled = 0 WHERE plugin_id = ?').run(pluginId)
  },

  orphanByPlugin(pluginId: string): void {
    const db = getDatabase()
    db.prepare('UPDATE labels SET plugin_id = NULL WHERE plugin_id = ?').run(pluginId)
  },

  listByPlugin(pluginId: string): Label[] {
    const db = getDatabase()
    return db.prepare('SELECT * FROM labels WHERE plugin_id = ?').all(pluginId) as Label[]
  },
}
