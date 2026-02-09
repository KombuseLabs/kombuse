import type {
  Ticket,
  TicketWithLabels,
  TicketFilters,
  CreateTicketInput,
  UpdateTicketInput,
  ClaimTicketInput,
  ClaimResult,
} from '@kombuse/types'
import { EVENT_TYPES } from '@kombuse/types'
import { getDatabase } from './database'
import { eventsRepository } from './events'
import { labelsRepository } from './labels'

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

    if (filters?.project_id) {
      conditions.push('project_id = ?')
      params.push(filters.project_id)
    }
    if (filters?.status) {
      conditions.push('status = ?')
      params.push(filters.status)
    }
    if (filters?.priority !== undefined) {
      conditions.push('priority = ?')
      params.push(filters.priority)
    }
    if (filters?.author_id) {
      conditions.push('author_id = ?')
      params.push(filters.author_id)
    }
    if (filters?.assignee_id) {
      conditions.push('assignee_id = ?')
      params.push(filters.assignee_id)
    }
    if (filters?.claimed_by_id) {
      conditions.push('claimed_by_id = ?')
      params.push(filters.claimed_by_id)
    }
    if (filters?.unclaimed) {
      conditions.push('claimed_by_id IS NULL')
    }
    if (filters?.expired_claims) {
      conditions.push(
        "claim_expires_at IS NOT NULL AND claim_expires_at < datetime('now') AND claimed_by_id IS NOT NULL"
      )
    }
    if (filters?.search) {
      conditions.push('(title LIKE ? OR body LIKE ?)')
      params.push(`%${filters.search}%`, `%${filters.search}%`)
    }
    if (filters?.label_ids && filters.label_ids.length > 0) {
      const placeholders = filters.label_ids.map(() => '?').join(', ')
      conditions.push(
        `id IN (SELECT ticket_id FROM ticket_labels WHERE label_id IN (${placeholders}) GROUP BY ticket_id HAVING COUNT(DISTINCT label_id) = ?)`
      )
      params.push(...filters.label_ids, filters.label_ids.length)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const ALLOWED_SORT_COLUMNS = ['created_at', 'updated_at', 'closed_at', 'opened_at', 'last_activity_at'] as const
    const sortBy = filters?.sort_by && ALLOWED_SORT_COLUMNS.includes(filters.sort_by)
      ? filters.sort_by
      : 'created_at'
    const sortOrder = filters?.sort_order === 'asc' ? 'ASC' : 'DESC'

    const limit = filters?.limit || 100
    const offset = filters?.offset || 0

    const stmt = db.prepare(`
      SELECT * FROM tickets
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `)

    return stmt.all(...params, limit, offset) as Ticket[]
  },

  /**
   * List all tickets with their labels
   */
  listWithLabels(filters?: TicketFilters): TicketWithLabels[] {
    const tickets = this.list(filters)
    if (tickets.length === 0) return []

    const ticketIds = tickets.map((t) => t.id)
    const labelsByTicket = labelsRepository.getLabelsForTickets(ticketIds)

    return tickets.map((ticket) => ({
      ...ticket,
      labels: labelsByTicket.get(ticket.id) ?? [],
    }))
  },

  /**
   * Get a single ticket by ID
   */
  get(id: number): Ticket | null {
    const db = getDatabase()
    const ticket = db
      .prepare('SELECT * FROM tickets WHERE id = ?')
      .get(id) as Ticket | undefined
    return ticket ?? null
  },

  /**
   * Create a new ticket
   */
  create(input: CreateTicketInput): Ticket {
    const db = getDatabase()
    const insertTicket = db.prepare(`
      INSERT INTO tickets (
        project_id, author_id, assignee_id, title, body, status, priority,
        external_source, external_id, external_url,
        opened_at, closed_at, last_activity_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), CASE WHEN ? = 'closed' THEN datetime('now') ELSE NULL END, datetime('now'))
    `)

    const insertTicketLabels = db.prepare(`
      INSERT INTO ticket_labels (ticket_id, label_id, added_by_id)
      VALUES (?, ?, ?)
    `)

    const createTicket = db.transaction((payload: CreateTicketInput) => {
      const labelIds = Array.from(
        new Set((payload.label_ids ?? []).filter((id) => Number.isFinite(id)))
      )

      const status = payload.status ?? 'open'
      const result = insertTicket.run(
        payload.project_id,
        payload.author_id,
        payload.assignee_id ?? null,
        payload.title,
        payload.body ?? null,
        status,
        payload.priority ?? null,
        payload.external_source ?? null,
        payload.external_id ?? null,
        payload.external_url ?? null,
        status
      )

      const ticketId = result.lastInsertRowid as number

      if (labelIds.length > 0) {
        const placeholders = labelIds.map(() => '?').join(', ')
        const rows = db
          .prepare(
            `SELECT id FROM labels WHERE project_id = ? AND id IN (${placeholders})`
          )
          .all(payload.project_id, ...labelIds) as { id: number }[]

        if (rows.length !== labelIds.length) {
          throw new Error('One or more labels are invalid for this project')
        }

        for (const labelId of labelIds) {
          insertTicketLabels.run(ticketId, labelId, payload.author_id)
        }
      }

      return ticketId
    })

    const ticketId = createTicket(input)
    const ticket = this.get(ticketId) as Ticket

    // Emit ticket.created event
    eventsRepository.create({
      event_type: EVENT_TYPES.TICKET_CREATED,
      project_id: ticket.project_id,
      ticket_id: ticket.id,
      actor_id: ticket.author_id,
      actor_type: 'user',
      payload: { title: ticket.title },
    })

    return ticket
  },

  /**
   * Update an existing ticket
   */
  update(id: number, input: UpdateTicketInput): Ticket | null {
    const db = getDatabase()

    // Get current ticket to detect status changes
    const currentTicket = this.get(id)
    if (!currentTicket) return null

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
      // Track opened_at / closed_at on status transitions
      if (input.status !== currentTicket.status) {
        if (input.status === 'closed') {
          fields.push("closed_at = datetime('now')")
        } else if (currentTicket.status === 'closed') {
          fields.push("opened_at = datetime('now')")
          fields.push('closed_at = NULL')
        }
      }
    }
    if (input.priority !== undefined) {
      fields.push('priority = ?')
      params.push(input.priority)
    }
    if (input.assignee_id !== undefined) {
      fields.push('assignee_id = ?')
      params.push(input.assignee_id)
    }
    if (input.external_source !== undefined) {
      fields.push('external_source = ?')
      params.push(input.external_source)
    }
    if (input.external_id !== undefined) {
      fields.push('external_id = ?')
      params.push(input.external_id)
    }
    if (input.external_url !== undefined) {
      fields.push('external_url = ?')
      params.push(input.external_url)
    }

    if (fields.length === 0) return currentTicket

    fields.push("updated_at = datetime('now')")
    fields.push("last_activity_at = datetime('now')")
    params.push(id)

    db.prepare(`UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`).run(
      ...params
    )

    const updatedTicket = this.get(id)

    // Emit appropriate event based on status change
    let eventType: string = EVENT_TYPES.TICKET_UPDATED
    if (input.status && input.status !== currentTicket.status) {
      if (input.status === 'closed') {
        eventType = EVENT_TYPES.TICKET_CLOSED
      } else if (currentTicket.status === 'closed') {
        eventType = EVENT_TYPES.TICKET_REOPENED
      }
    }

    eventsRepository.create({
      event_type: eventType,
      project_id: currentTicket.project_id,
      ticket_id: id,
      actor_type: 'user',
      payload: { changes: Object.keys(input) },
    })

    return updatedTicket
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
   * Claim a ticket for a claimer.
   * Fails if the ticket is already claimed by someone else (unless claim expired).
   */
  claim(input: ClaimTicketInput): ClaimResult {
    const db = getDatabase()
    const claimerId = input.claimer_id
    const claimModifier = input.duration_minutes
      ? `+${input.duration_minutes} minutes`
      : null

    const stmt = db.prepare(`
      UPDATE tickets
      SET claimed_by_id = ?,
          claimed_at = datetime('now'),
          claim_expires_at = CASE
            WHEN ? IS NULL THEN NULL
            ELSE datetime('now', ?)
          END,
          assignee_id = COALESCE(assignee_id, ?),
          updated_at = datetime('now'),
          last_activity_at = datetime('now')
      WHERE id = ?
        AND (assignee_id IS NULL OR assignee_id = ?)
        AND (
          claimed_by_id IS NULL OR
          claimed_by_id = ? OR
          (claim_expires_at IS NOT NULL AND claim_expires_at < datetime('now'))
        )
    `)

    const result = stmt.run(
      claimerId,
      claimModifier,
      claimModifier,
      claimerId,
      input.ticket_id,
      claimerId,
      claimerId
    )

    if (result.changes > 0) {
      const claimedTicket = this.get(input.ticket_id)

      // Emit ticket.claimed event
      eventsRepository.create({
        event_type: EVENT_TYPES.TICKET_CLAIMED,
        project_id: claimedTicket?.project_id,
        ticket_id: input.ticket_id,
        actor_id: claimerId,
        actor_type: 'user',
        payload: { claimed_by_id: claimerId },
      })

      return { success: true, ticket: claimedTicket }
    }

    const ticket = this.get(input.ticket_id)
    if (!ticket) {
      return { success: false, ticket: null, reason: 'Ticket not found' }
    }

    if (ticket.assignee_id && ticket.assignee_id !== claimerId) {
      return {
        success: false,
        ticket,
        reason: `Ticket assigned to ${ticket.assignee_id}`,
      }
    }

    if (ticket.claimed_by_id && ticket.claimed_by_id !== claimerId) {
      return {
        success: false,
        ticket,
        reason: `Ticket already claimed by ${ticket.claimed_by_id}`,
      }
    }

    return { success: false, ticket, reason: 'Ticket could not be claimed' }
  },

  /**
   * Release a claim on a ticket.
   * Only the current claimer (or force) can unclaim.
   */
  unclaim(ticketId: number, requesterId?: string, force = false): ClaimResult {
    const db = getDatabase()
    const ticket = this.get(ticketId)

    if (!ticket) {
      return { success: false, ticket: null, reason: 'Ticket not found' }
    }

    if (!ticket.claimed_by_id) {
      return { success: false, ticket, reason: 'Ticket is not claimed' }
    }

    // Only the current claimer can unclaim (unless forced)
    if (!force && requesterId && ticket.claimed_by_id !== requesterId) {
      return {
        success: false,
        ticket,
        reason: 'Only the current claimer can unclaim this ticket',
      }
    }

    const previousClaimerId = ticket.claimed_by_id

    const stmt = db.prepare(`
      UPDATE tickets
      SET claimed_by_id = NULL,
          claimed_at = NULL,
          claim_expires_at = NULL,
          updated_at = datetime('now'),
          last_activity_at = datetime('now')
      WHERE id = ?
    `)

    stmt.run(ticketId)

    const unclaimedTicket = this.get(ticketId)

    // Emit ticket.unclaimed event
    eventsRepository.create({
      event_type: EVENT_TYPES.TICKET_UNCLAIMED,
      project_id: ticket.project_id,
      ticket_id: ticketId,
      actor_id: requesterId,
      actor_type: 'user',
      payload: { previous_claimer_id: previousClaimerId },
    })

    return { success: true, ticket: unclaimedTicket }
  },

  /**
   * Extend the claim expiration for a ticket
   */
  extendClaim(ticketId: number, additionalMinutes: number): ClaimResult {
    const db = getDatabase()
    const ticket = this.get(ticketId)

    if (!ticket) {
      return { success: false, ticket: null, reason: 'Ticket not found' }
    }

    if (!ticket.claimed_by_id) {
      return { success: false, ticket, reason: 'Ticket is not claimed' }
    }

    const stmt = db.prepare(`
      UPDATE tickets
      SET claim_expires_at = datetime(COALESCE(claim_expires_at, datetime('now')), ?),
          updated_at = datetime('now'),
          last_activity_at = datetime('now')
      WHERE id = ?
    `)

    stmt.run(`+${additionalMinutes} minutes`, ticketId)

    return { success: true, ticket: this.get(ticketId) }
  },

  /**
   * Find tickets with expired claims (for cleanup/reassignment)
   */
  findExpiredClaims(): Ticket[] {
    const db = getDatabase()
    return db
      .prepare(
        `
        SELECT * FROM tickets
        WHERE claim_expires_at IS NOT NULL
          AND claim_expires_at < datetime('now')
          AND claimed_by_id IS NOT NULL
        ORDER BY claim_expires_at ASC
      `
      )
      .all() as Ticket[]
  },
}
