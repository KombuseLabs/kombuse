import type {
  ActorType,
  Ticket,
  TicketStatusCounts,
  TicketWithLabels,
  TicketWithRelations,
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
import { profilesRepository } from './profiles'
import { ticketViewsRepository } from './ticket-views'

const FTS5_KEYWORDS = new Set(['AND', 'OR', 'NOT', 'NEAR'])

function sanitizeFtsQuery(input: string): string | null {
  const stripped = input.replace(/["()*^{}]/g, '')
  const tokens = stripped
    .split(/\s+/)
    .filter((t) => t.length > 0 && !FTS5_KEYWORDS.has(t.toUpperCase()))
  if (tokens.length === 0) return null
  return tokens.map((t) => `"${t}"*`).join(' ')
}

interface RawTicketRow extends Omit<Ticket, 'triggers_enabled' | 'loop_protection_enabled'> {
  triggers_enabled: number
  loop_protection_enabled: number
}

function mapTicketRow(row: RawTicketRow): Ticket {
  return {
    ...row,
    triggers_enabled: row.triggers_enabled === 1,
    loop_protection_enabled: row.loop_protection_enabled === 1,
  }
}

// Raw ticket row with joined author and assignee profile columns
interface RawTicketWithProfiles {
  id: number
  project_id: string
  author_id: string
  assignee_id: string | null
  claimed_by_id: string | null
  title: string
  body: string | null
  triggers_enabled: number
  loop_protection_enabled: number
  status: string
  priority: number | null
  external_source: string | null
  external_id: string | null
  milestone_id: number | null
  external_url: string | null
  synced_at: string | null
  claimed_at: string | null
  claim_expires_at: string | null
  created_at: string
  updated_at: string
  opened_at: string
  closed_at: string | null
  last_activity_at: string
  author_type: string
  author_name: string
  author_email: string | null
  author_description: string | null
  author_avatar_url: string | null
  author_external_source: string | null
  author_external_id: string | null
  author_is_active: number
  author_created_at: string
  author_updated_at: string
  assignee_type: string | null
  assignee_name: string | null
  assignee_email: string | null
  assignee_description: string | null
  assignee_avatar_url: string | null
  assignee_external_source: string | null
  assignee_external_id: string | null
  assignee_is_active: number | null
  assignee_created_at: string | null
  assignee_updated_at: string | null
}

const TICKET_WITH_PROFILES_SELECT = `
  SELECT t.*,
    ap.type AS author_type, ap.name AS author_name, ap.email AS author_email,
    ap.description AS author_description, ap.avatar_url AS author_avatar_url,
    ap.external_source AS author_external_source, ap.external_id AS author_external_id,
    ap.is_active AS author_is_active, ap.created_at AS author_created_at,
    ap.updated_at AS author_updated_at,
    asp.type AS assignee_type, asp.name AS assignee_name, asp.email AS assignee_email,
    asp.description AS assignee_description, asp.avatar_url AS assignee_avatar_url,
    asp.external_source AS assignee_external_source, asp.external_id AS assignee_external_id,
    asp.is_active AS assignee_is_active, asp.created_at AS assignee_created_at,
    asp.updated_at AS assignee_updated_at
  FROM tickets t
  JOIN profiles ap ON ap.id = t.author_id
  LEFT JOIN profiles asp ON asp.id = t.assignee_id
`

function mapTicketWithProfiles(row: RawTicketWithProfiles): Omit<TicketWithRelations, 'labels' | 'has_unread'> {
  return {
    id: row.id,
    project_id: row.project_id,
    author_id: row.author_id,
    assignee_id: row.assignee_id,
    claimed_by_id: row.claimed_by_id,
    title: row.title,
    body: row.body,
    triggers_enabled: row.triggers_enabled === 1,
    loop_protection_enabled: row.loop_protection_enabled === 1,
    status: row.status as Ticket['status'],
    priority: row.priority as Ticket['priority'],
    milestone_id: row.milestone_id,
    external_source: row.external_source,
    external_id: row.external_id,
    external_url: row.external_url,
    synced_at: row.synced_at,
    claimed_at: row.claimed_at,
    claim_expires_at: row.claim_expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    opened_at: row.opened_at,
    closed_at: row.closed_at,
    last_activity_at: row.last_activity_at,
    author: {
      id: row.author_id,
      type: row.author_type as 'user' | 'agent',
      name: row.author_name,
      email: row.author_email,
      description: row.author_description,
      avatar_url: row.author_avatar_url,
      external_source: row.author_external_source,
      external_id: row.author_external_id,
      is_active: row.author_is_active === 1,
      created_at: row.author_created_at,
      updated_at: row.author_updated_at,
    },
    assignee: row.assignee_id && row.assignee_type ? {
      id: row.assignee_id,
      type: row.assignee_type as 'user' | 'agent',
      name: row.assignee_name!,
      email: row.assignee_email ?? null,
      description: row.assignee_description ?? null,
      avatar_url: row.assignee_avatar_url ?? null,
      external_source: row.assignee_external_source ?? null,
      external_id: row.assignee_external_id ?? null,
      is_active: row.assignee_is_active === 1,
      created_at: row.assignee_created_at!,
      updated_at: row.assignee_updated_at!,
    } : null,
  }
}

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
    const selectParams: unknown[] = []
    const joinParams: unknown[] = []
    const params: unknown[] = []
    let joinClause = ''
    let selectColumns = 'tickets.*'
    let useRelevanceSort = false
    let idBoostParam: number | null = null
    let hasSnippets = false

    // Viewer-based unread computation (JOIN param must precede WHERE params)
    if (filters?.viewer_id) {
      joinClause += ` LEFT JOIN ticket_views tv
        ON tv.ticket_id = tickets.id AND tv.profile_id = ?`
      joinParams.push(filters.viewer_id)
      // '1970-01-01' sentinel: tickets with no view record (tv.last_viewed_at IS NULL)
      // are always treated as unread
      selectColumns += `,
        CASE WHEN tickets.last_activity_at > COALESCE(tv.last_viewed_at, '1970-01-01')
          THEN 1 ELSE 0 END AS has_unread`
    }

    if (filters?.project_id) {
      conditions.push('tickets.project_id = ?')
      params.push(filters.project_id)
    }
    if (filters?.status) {
      conditions.push('tickets.status = ?')
      params.push(filters.status)
    }
    if (filters?.priority !== undefined) {
      conditions.push('tickets.priority = ?')
      params.push(filters.priority)
    }
    if (filters?.author_id) {
      conditions.push('tickets.author_id = ?')
      params.push(filters.author_id)
    }
    if (filters?.assignee_id) {
      conditions.push('tickets.assignee_id = ?')
      params.push(filters.assignee_id)
    }
    if (filters?.claimed_by_id) {
      conditions.push('tickets.claimed_by_id = ?')
      params.push(filters.claimed_by_id)
    }
    if (filters?.milestone_id) {
      conditions.push('tickets.milestone_id = ?')
      params.push(filters.milestone_id)
    }
    if (filters?.unclaimed) {
      conditions.push('tickets.claimed_by_id IS NULL')
    }
    if (filters?.expired_claims) {
      conditions.push(
        "tickets.claim_expires_at IS NOT NULL AND tickets.claim_expires_at < datetime('now') AND tickets.claimed_by_id IS NOT NULL"
      )
    }
    if (filters?.search) {
      const ftsQuery = sanitizeFtsQuery(filters.search)
      const trimmed = filters.search.trim()
      const numericId = /^\d+$/.test(trimmed) ? Number(trimmed) : null

      if (ftsQuery && numericId !== null) {
        // Numeric query: match by FTS (title/body/comments) OR exact ticket ID, boost ID match to top
        joinClause +=
          ' LEFT JOIN tickets_fts ON tickets.id = tickets_fts.rowid AND tickets_fts MATCH ?'
        joinParams.push(ftsQuery)
        selectColumns += `, CASE WHEN tickets_fts.rowid IS NOT NULL THEN snippet(tickets_fts, 1, '«', '»', '…', 64) ELSE NULL END AS body_snippet`
        selectColumns += `, (SELECT snippet(comments_fts, 0, '«', '»', '…', 64) FROM comments JOIN comments_fts ON comments.id = comments_fts.rowid WHERE comments.ticket_id = tickets.id AND comments_fts MATCH ? LIMIT 1) AS comment_snippet`
        selectParams.push(ftsQuery)
        hasSnippets = true
        conditions.push(`(tickets_fts.rowid IS NOT NULL OR tickets.id = ? OR tickets.id IN (
          SELECT ticket_id FROM comments JOIN comments_fts ON comments.id = comments_fts.rowid WHERE comments_fts MATCH ?
        ))`)
        params.push(numericId, ftsQuery)
        useRelevanceSort = true
        idBoostParam = numericId
      } else if (ftsQuery) {
        // Text query: FTS across ticket title/body AND comment bodies
        joinClause +=
          ' LEFT JOIN tickets_fts ON tickets.id = tickets_fts.rowid AND tickets_fts MATCH ?'
        joinParams.push(ftsQuery)
        selectColumns += `, CASE WHEN tickets_fts.rowid IS NOT NULL THEN snippet(tickets_fts, 1, '«', '»', '…', 64) ELSE NULL END AS body_snippet`
        selectColumns += `, (SELECT snippet(comments_fts, 0, '«', '»', '…', 64) FROM comments JOIN comments_fts ON comments.id = comments_fts.rowid WHERE comments.ticket_id = tickets.id AND comments_fts MATCH ? LIMIT 1) AS comment_snippet`
        selectParams.push(ftsQuery)
        hasSnippets = true
        conditions.push(`(tickets_fts.rowid IS NOT NULL OR tickets.id IN (
          SELECT ticket_id FROM comments JOIN comments_fts ON comments.id = comments_fts.rowid WHERE comments_fts MATCH ?
        ))`)
        params.push(ftsQuery)
        useRelevanceSort = true
      } else if (numericId !== null) {
        // Defensive: unreachable while sanitizeFtsQuery passes digit-only strings, but guards against future changes
        conditions.push('tickets.id = ?')
        params.push(numericId)
      }
    }
    if (filters?.label_ids && filters.label_ids.length > 0) {
      const placeholders = filters.label_ids.map(() => '?').join(', ')
      conditions.push(
        `tickets.id IN (SELECT ticket_id FROM ticket_labels WHERE label_id IN (${placeholders}) GROUP BY ticket_id HAVING COUNT(DISTINCT label_id) = ?)`
      )
      params.push(...filters.label_ids, filters.label_ids.length)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const ALLOWED_SORT_COLUMNS = ['created_at', 'updated_at', 'closed_at', 'opened_at', 'last_activity_at'] as const
    let orderByClause: string
    const orderByParams: unknown[] = []
    if (useRelevanceSort && !filters?.sort_by) {
      if (idBoostParam !== null) {
        orderByClause = 'ORDER BY CASE WHEN tickets.id = ? THEN 0 WHEN tickets_fts.rank IS NOT NULL THEN 1 ELSE 2 END, tickets_fts.rank, tickets.updated_at DESC'
        orderByParams.push(idBoostParam)
      } else {
        orderByClause = 'ORDER BY CASE WHEN tickets_fts.rank IS NOT NULL THEN 0 ELSE 1 END, tickets_fts.rank, tickets.updated_at DESC'
      }
    } else {
      const sortBy = filters?.sort_by && ALLOWED_SORT_COLUMNS.includes(filters.sort_by)
        ? filters.sort_by
        : 'created_at'
      const sortOrder = filters?.sort_order === 'asc' ? 'ASC' : 'DESC'
      orderByClause = `ORDER BY ${sortBy} ${sortOrder}`
    }

    const limit = filters?.limit || 100
    const offset = filters?.offset || 0

    const stmt = db.prepare(`
      SELECT ${selectColumns} FROM tickets
      ${joinClause}
      ${whereClause}
      ${orderByClause}
      LIMIT ? OFFSET ?
    `)

    const rows = stmt.all(
      ...selectParams,
      ...joinParams,
      ...params,
      ...orderByParams,
      limit,
      offset
    ) as (RawTicketRow & {
      body_snippet?: string | null
      comment_snippet?: string | null
    })[]

    if (hasSnippets) {
      return rows.map((row) => {
        const match_context = row.body_snippet ?? row.comment_snippet ?? null
        let match_source: 'body' | 'comment' | null = null
        if (row.body_snippet) match_source = 'body'
        else if (row.comment_snippet) match_source = 'comment'

        const { body_snippet, comment_snippet, ...ticketRow } = row
        const ticket = mapTicketRow(ticketRow)
        void body_snippet
        void comment_snippet
        return { ...ticket, match_context, match_source }
      })
    }

    return rows.map((row) => mapTicketRow(row))
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
   * List tickets with resolved author, assignee profiles, and labels
   */
  listWithRelations(filters?: TicketFilters): TicketWithRelations[] {
    const tickets = this.list(filters)
    if (tickets.length === 0) return []

    const ticketIds = tickets.map((t) => t.id)
    const labelsByTicket = labelsRepository.getLabelsForTickets(ticketIds)

    const profileIds = new Set<string>()
    for (const ticket of tickets) {
      profileIds.add(ticket.author_id)
      if (ticket.assignee_id) profileIds.add(ticket.assignee_id)
    }

    const profilesMap = profilesRepository.getByIds([...profileIds])

    return tickets.map((ticket) => ({
      ...ticket,
      author: profilesMap.get(ticket.author_id)!,
      assignee: ticket.assignee_id ? profilesMap.get(ticket.assignee_id) ?? null : null,
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
      .get(id) as RawTicketRow | undefined
    return ticket ? mapTicketRow(ticket) : null
  },

  /**
   * Get a single ticket by ID with resolved author, assignee, and labels
   */
  getWithRelations(id: number): TicketWithRelations | null {
    const db = getDatabase()
    const row = db
      .prepare(`${TICKET_WITH_PROFILES_SELECT} WHERE t.id = ?`)
      .get(id) as RawTicketWithProfiles | undefined
    if (!row) return null

    const labels = labelsRepository.getTicketLabels(id)
    return { ...mapTicketWithProfiles(row), labels }
  },

  /**
   * Create a new ticket
   */
  create(input: CreateTicketInput): Ticket {
    const db = getDatabase()
    const insertTicket = db.prepare(`
      INSERT INTO tickets (
        project_id, author_id, assignee_id, title, body, triggers_enabled, loop_protection_enabled, status, priority,
        milestone_id, external_source, external_id, external_url,
        opened_at, closed_at, last_activity_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), CASE WHEN ? = 'closed' THEN datetime('now') ELSE NULL END, datetime('now'))
    `)

    const insertTicketLabels = db.prepare(`
      INSERT INTO ticket_labels (ticket_id, label_id, added_by_id)
      VALUES (?, ?, ?)
    `)

    const createTicket = db.transaction((payload: CreateTicketInput) => {
      const labelIds = Array.from(
        new Set((payload.label_ids ?? []).filter((id) => Number.isFinite(id)))
      )

      if (payload.milestone_id) {
        const milestoneRow = db
          .prepare(
            'SELECT id FROM milestones WHERE project_id = ? AND id = ?'
          )
          .get(payload.project_id, payload.milestone_id) as
          | { id: number }
          | undefined

        if (!milestoneRow) {
          throw new Error('Milestone is invalid for this project')
        }
      }

      const status = payload.status ?? 'open'
      const result = insertTicket.run(
        payload.project_id,
        payload.author_id,
        payload.assignee_id ?? null,
        payload.title,
        payload.body ?? null,
        payload.triggers_enabled === false ? 0 : 1,
        payload.loop_protection_enabled === false ? 0 : 1,
        status,
        payload.priority ?? null,
        payload.milestone_id ?? null,
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

    if (ticket.triggers_enabled) {
      // Emit ticket.created event
      const authorProfile = ticket.author_id ? profilesRepository.get(ticket.author_id) : null
      const authorActorType: ActorType = authorProfile?.type === 'agent' ? 'agent' : 'user'
      eventsRepository.create({
        event_type: EVENT_TYPES.TICKET_CREATED,
        project_id: ticket.project_id,
        ticket_id: ticket.id,
        actor_id: ticket.author_id,
        actor_type: authorActorType,
        payload: { title: ticket.title },
      })
    }

    return ticket
  },

  /**
   * Update an existing ticket
   */
  update(id: number, input: UpdateTicketInput, updatedById?: string): Ticket | null {
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
    if (input.triggers_enabled !== undefined) {
      fields.push('triggers_enabled = ?')
      params.push(input.triggers_enabled ? 1 : 0)
    }
    if (input.loop_protection_enabled !== undefined) {
      fields.push('loop_protection_enabled = ?')
      params.push(input.loop_protection_enabled ? 1 : 0)
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
    if (input.milestone_id !== undefined) {
      if (input.milestone_id !== null) {
        const milestoneRow = db
          .prepare(
            'SELECT id FROM milestones WHERE project_id = ? AND id = ?'
          )
          .get(currentTicket.project_id, input.milestone_id) as
          | { id: number }
          | undefined

        if (!milestoneRow) {
          throw new Error('Milestone is invalid for this project')
        }
      }
      fields.push('milestone_id = ?')
      params.push(input.milestone_id)
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

    if (updatedById) {
      ticketViewsRepository.upsert({
        ticket_id: id,
        profile_id: updatedById,
      })
    }

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

    const updaterProfile = updatedById ? profilesRepository.get(updatedById) : null
    const updaterActorType: ActorType = updaterProfile?.type === 'agent' ? 'agent' : 'user'
    eventsRepository.create({
      event_type: eventType,
      project_id: currentTicket.project_id,
      ticket_id: id,
      actor_id: updatedById,
      actor_type: updaterActorType,
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
      const claimerProfile = claimerId ? profilesRepository.get(claimerId) : null
      const claimerActorType: ActorType = claimerProfile?.type === 'agent' ? 'agent' : 'user'
      eventsRepository.create({
        event_type: EVENT_TYPES.TICKET_CLAIMED,
        project_id: claimedTicket?.project_id,
        ticket_id: input.ticket_id,
        actor_id: claimerId,
        actor_type: claimerActorType,
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
    const requesterProfile = requesterId ? profilesRepository.get(requesterId) : null
    const requesterActorType: ActorType = requesterProfile?.type === 'agent' ? 'agent' : 'user'
    eventsRepository.create({
      event_type: EVENT_TYPES.TICKET_UNCLAIMED,
      project_id: ticket.project_id,
      ticket_id: ticketId,
      actor_id: requesterId,
      actor_type: requesterActorType,
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
    const rows = db
      .prepare(
        `
        SELECT * FROM tickets
        WHERE claim_expires_at IS NOT NULL
          AND claim_expires_at < datetime('now')
          AND claimed_by_id IS NOT NULL
        ORDER BY claim_expires_at ASC
      `
      )
      .all() as RawTicketRow[]

    return rows.map((row) => mapTicketRow(row))
  },

  countByStatus(projectId: string): TicketStatusCounts {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT status, COUNT(*) as count FROM tickets WHERE project_id = ? GROUP BY status`
      )
      .all(projectId) as { status: string; count: number }[]

    const counts: TicketStatusCounts = { open: 0, in_progress: 0, blocked: 0, closed: 0 }
    for (const row of rows) {
      if (row.status in counts) {
        counts[row.status as keyof TicketStatusCounts] = row.count
      }
    }
    return counts
  },
}
