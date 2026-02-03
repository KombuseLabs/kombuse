import type {
  Ticket,
  TicketWithActivities,
  TicketActivity,
  TicketFilters,
  CreateTicketInput,
  UpdateTicketInput,
} from '@kombuse/types'
import { getDatabase } from './database'

/**
 * Data access layer for tickets
 */
export const ticketsRepository = {
  /**
   * List all tickets with optional filters
   */
  list(filters?: TicketFilters): Ticket[] {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.status) {
      conditions.push('status = ?')
      params.push(filters.status)
    }
    if (filters?.priority !== undefined) {
      conditions.push('priority = ?')
      params.push(filters.priority)
    }
    if (filters?.project_id) {
      conditions.push('project_id = ?')
      params.push(filters.project_id)
    }
    if (filters?.search) {
      conditions.push('(title LIKE ? OR body LIKE ?)')
      params.push(`%${filters.search}%`, `%${filters.search}%`)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const limit = filters?.limit || 100
    const offset = filters?.offset || 0

    const stmt = db.prepare(`
      SELECT * FROM tickets
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `)

    return stmt.all(...params, limit, offset) as Ticket[]
  },

  /**
   * Get a single ticket by ID with activities
   */
  get(id: number): TicketWithActivities | null {
    const db = getDatabase()

    const ticket = db
      .prepare('SELECT * FROM tickets WHERE id = ?')
      .get(id) as Ticket | undefined
    if (!ticket) return null

    const activities = db
      .prepare(
        'SELECT * FROM ticket_activities WHERE ticket_id = ? ORDER BY created_at DESC'
      )
      .all(id) as TicketActivity[]

    return { ...ticket, activities }
  },

  /**
   * Create a new ticket
   */
  create(input: CreateTicketInput): Ticket {
    const db = getDatabase()

    const stmt = db.prepare(`
      INSERT INTO tickets (title, body, status, priority, project_id, github_id, repo_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      input.title,
      input.body ?? null,
      input.status ?? 'open',
      input.priority ?? null,
      input.project_id ?? null,
      input.github_id ?? null,
      input.repo_name ?? null
    )

    return this.get(result.lastInsertRowid as number) as Ticket
  },

  /**
   * Update an existing ticket
   */
  update(id: number, input: UpdateTicketInput): Ticket | null {
    const db = getDatabase()

    const fields: string[] = []
    const params: unknown[] = []

    if (input.title !== undefined) {
      fields.push('title = ?')
      params.push(input.title)
    }
    if (input.body !== undefined) {
      fields.push('body = ?')
      params.push(input.body)
    }
    if (input.status !== undefined) {
      fields.push('status = ?')
      params.push(input.status)
    }
    if (input.priority !== undefined) {
      fields.push('priority = ?')
      params.push(input.priority)
    }
    if (input.project_id !== undefined) {
      fields.push('project_id = ?')
      params.push(input.project_id)
    }
    if (input.github_id !== undefined) {
      fields.push('github_id = ?')
      params.push(input.github_id)
    }
    if (input.repo_name !== undefined) {
      fields.push('repo_name = ?')
      params.push(input.repo_name)
    }

    if (fields.length === 0) return this.get(id)

    fields.push("updated_at = datetime('now')")
    params.push(id)

    db.prepare(`UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`).run(
      ...params
    )

    return this.get(id)
  },

  /**
   * Delete a ticket
   */
  delete(id: number): boolean {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM tickets WHERE id = ?').run(id)
    return result.changes > 0
  },

  /**
   * Add an activity log entry
   */
  addActivity(
    ticketId: number,
    action: string,
    details?: string
  ): TicketActivity {
    const db = getDatabase()

    const result = db
      .prepare(
        `
      INSERT INTO ticket_activities (ticket_id, action, details)
      VALUES (?, ?, ?)
    `
      )
      .run(ticketId, action, details ?? null)

    return db
      .prepare('SELECT * FROM ticket_activities WHERE id = ?')
      .get(result.lastInsertRowid) as TicketActivity
  },
}
