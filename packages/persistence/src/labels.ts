import type {
  ActorType,
  Label,
  LabelFilters,
  CreateLabelInput,
  UpdateLabelInput,
} from '@kombuse/types'
import { EVENT_TYPES } from '@kombuse/types'
import { getDatabase } from './database'
import { eventsRepository } from './events'
import { profilesRepository } from './profiles'

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
      conditions.push('project_id = ?')
      params.push(filters.project_id)
    }
    if (filters?.search) {
      conditions.push('(name LIKE ? OR description LIKE ?)')
      params.push(`%${filters.search}%`, `%${filters.search}%`)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const stmt = db.prepare(`
      SELECT * FROM labels
      ${whereClause}
      ORDER BY name ASC
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
  getByProject(projectId: string): Label[] {
    const db = getDatabase()
    return db
      .prepare('SELECT * FROM labels WHERE project_id = ? ORDER BY name ASC')
      .all(projectId) as Label[]
  },

  /**
   * Create a new label
   */
  create(input: CreateLabelInput): Label {
    const db = getDatabase()

    const result = db
      .prepare(
        `
      INSERT INTO labels (project_id, name, color, description)
      VALUES (?, ?, ?, ?)
    `
      )
      .run(
        input.project_id,
        input.name,
        input.color ?? '#808080',
        input.description ?? null
      )

    return this.get(result.lastInsertRowid as number) as Label
  },

  /**
   * Update an existing label
   */
  update(id: number, input: UpdateLabelInput): Label | null {
    const db = getDatabase()

    const fields: string[] = []
    const params: unknown[] = []

    if (input.name !== undefined) {
      fields.push('name = ?')
      params.push(input.name)
    }
    if (input.color !== undefined) {
      fields.push('color = ?')
      params.push(input.color)
    }
    if (input.description !== undefined) {
      fields.push('description = ?')
      params.push(input.description)
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
      const adderActorType: ActorType = adderProfile?.type === 'agent' ? 'agent' : 'user'
      eventsRepository.create({
        event_type: EVENT_TYPES.LABEL_ADDED,
        project_id: ticket?.project_id,
        ticket_id: ticketId,
        actor_id: addedById,
        actor_type: adderActorType,
        payload: { label_id: labelId, label_name: label?.name },
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
      const removerActorType: ActorType = removerProfile?.type === 'agent' ? 'agent' : 'user'
      eventsRepository.create({
        event_type: EVENT_TYPES.LABEL_REMOVED,
        project_id: ticket?.project_id,
        ticket_id: ticketId,
        actor_id: removedById,
        actor_type: removerActorType,
        payload: { label_id: labelId, label_name: label?.name },
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
   * Get all tickets with a specific label
   */
  getTicketIds(labelId: number): number[] {
    const db = getDatabase()
    const rows = db
      .prepare('SELECT ticket_id FROM ticket_labels WHERE label_id = ?')
      .all(labelId) as { ticket_id: number }[]
    return rows.map((r) => r.ticket_id)
  },
}
