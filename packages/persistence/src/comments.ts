import type {
  Comment,
  CommentFilters,
  CreateCommentInput,
  UpdateCommentInput,
} from '@kombuse/types'
import { getDatabase } from './database'
import { mentionsRepository } from './mentions'
import { profilesRepository } from './profiles'
import { eventsRepository } from './events'

// Raw comment from database (is_edited is stored as INTEGER)
interface RawComment {
  id: number
  ticket_id: number
  author_id: string
  parent_id: number | null
  body: string
  external_source: string | null
  external_id: string | null
  synced_at: string | null
  is_edited: number
  created_at: string
  updated_at: string
}

// Map database row to Comment type
function mapComment(row: RawComment): Comment {
  return {
    ...row,
    is_edited: row.is_edited === 1,
  }
}

interface ParsedMentions {
  profileNames: string[]
  ticketIds: number[]
}

/**
 * Extract profile and ticket mentions from comment body.
 * Supports `@profile-name` and `#123` ticket references.
 */
function parseMentions(body: string): ParsedMentions {
  const profileMentionRegex = /@([a-zA-Z0-9_-]+)/g
  const ticketMentionRegex = /#(\d+)\b/g

  const profileNames = [
    ...new Set([...body.matchAll(profileMentionRegex)].map((match) => match[1]!)),
  ]

  const ticketIds = [
    ...new Set(
      [...body.matchAll(ticketMentionRegex)]
        .map((match) => Number.parseInt(match[1]!, 10))
        .filter((ticketId) => Number.isInteger(ticketId) && ticketId > 0)
    ),
  ]

  return { profileNames, ticketIds }
}

/**
 * Data access layer for comments
 */
export const commentsRepository = {
  /**
   * List all comments with optional filters
   */
  list(filters?: CommentFilters): Comment[] {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.ticket_id) {
      conditions.push('ticket_id = ?')
      params.push(filters.ticket_id)
    }
    if (filters?.author_id) {
      conditions.push('author_id = ?')
      params.push(filters.author_id)
    }
    if (filters?.parent_id !== undefined) {
      if (filters.parent_id === null) {
        conditions.push('parent_id IS NULL')
      } else {
        conditions.push('parent_id = ?')
        params.push(filters.parent_id)
      }
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const limit = filters?.limit || 100
    const offset = filters?.offset || 0

    const stmt = db.prepare(`
      SELECT * FROM comments
      ${whereClause}
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?
    `)

    const rows = stmt.all(...params, limit, offset) as RawComment[]
    return rows.map(mapComment)
  },

  /**
   * Get a single comment by ID
   */
  get(id: number): Comment | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM comments WHERE id = ?')
      .get(id) as RawComment | undefined
    return row ? mapComment(row) : null
  },

  /**
   * Get all comments for a ticket (chronological order)
   */
  getByTicket(ticketId: number): Comment[] {
    const db = getDatabase()
    const rows = db
      .prepare('SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at ASC')
      .all(ticketId) as RawComment[]
    return rows.map(mapComment)
  },

  /**
   * Create a new comment with automatic profile/ticket mention parsing.
   */
  create(input: CreateCommentInput): Comment {
    const db = getDatabase()

    const insertComment = db.prepare(`
      INSERT INTO comments (
        ticket_id, author_id, parent_id, body,
        external_source, external_id, is_edited
      )
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `)

    // Get project_id from ticket for event logging
    const ticket = db
      .prepare('SELECT project_id FROM tickets WHERE id = ?')
      .get(input.ticket_id) as { project_id: string } | undefined

    const createComment = db.transaction((payload: CreateCommentInput) => {
      // 1. Insert the comment
      const result = insertComment.run(
        payload.ticket_id,
        payload.author_id,
        payload.parent_id ?? null,
        payload.body,
        payload.external_source ?? null,
        payload.external_id ?? null
      )
      const commentId = result.lastInsertRowid as number

      // 2. Parse profile/ticket mentions from body
      const mentions = parseMentions(payload.body)

      // 3. Resolve profile mentions
      for (const name of mentions.profileNames) {
        const profile = profilesRepository.getByName(name)
        if (profile) {
          mentionsRepository.create({
            comment_id: commentId,
            mention_type: 'profile',
            mentioned_profile_id: profile.id,
            mention_text: `@${name}`,
          })

          // Create mention.created event
          eventsRepository.create({
            event_type: 'mention.created',
            project_id: ticket?.project_id,
            ticket_id: payload.ticket_id,
            comment_id: commentId,
            actor_id: payload.author_id,
            actor_type: 'user',
            payload: {
              mention_type: 'profile',
              mentioned_profile_id: profile.id,
              mention_text: `@${name}`,
            },
          })
        }
      }

      // 4. Resolve ticket mentions
      for (const mentionedTicketId of mentions.ticketIds) {
        const mentionedTicket = db
          .prepare('SELECT id FROM tickets WHERE id = ?')
          .get(mentionedTicketId) as { id: number } | undefined

        if (!mentionedTicket) {
          continue
        }

        mentionsRepository.create({
          comment_id: commentId,
          mention_type: 'ticket',
          mentioned_ticket_id: mentionedTicketId,
          mention_text: `#${mentionedTicketId}`,
        })

        eventsRepository.create({
          event_type: 'mention.created',
          project_id: ticket?.project_id,
          ticket_id: payload.ticket_id,
          comment_id: commentId,
          actor_id: payload.author_id,
          actor_type: 'user',
          payload: {
            mention_type: 'ticket',
            mentioned_ticket_id: mentionedTicketId,
            mention_text: `#${mentionedTicketId}`,
          },
        })
      }

      // 5. Create comment.added event
      eventsRepository.create({
        event_type: 'comment.added',
        project_id: ticket?.project_id,
        ticket_id: payload.ticket_id,
        comment_id: commentId,
        actor_id: payload.author_id,
        actor_type: 'user',
        payload: {
          comment_id: commentId,
          ticket_id: payload.ticket_id,
        },
      })

      return commentId
    })

    const commentId = createComment(input)
    return this.get(commentId) as Comment
  },

  /**
   * Update an existing comment
   */
  update(id: number, input: UpdateCommentInput): Comment | null {
    const db = getDatabase()

    const existingRow = db
      .prepare('SELECT * FROM comments WHERE id = ?')
      .get(id) as RawComment | undefined
    if (!existingRow) return null

    const fields: string[] = []
    const params: unknown[] = []

    if (input.body !== undefined) {
      fields.push('body = ?')
      params.push(input.body)
      // Mark as edited if body changes
      fields.push('is_edited = 1')
    }

    if (fields.length === 0) return mapComment(existingRow)

    fields.push("updated_at = datetime('now')")
    params.push(id)

    const updateComment = db.transaction(() => {
      db.prepare(`UPDATE comments SET ${fields.join(', ')} WHERE id = ?`).run(
        ...params
      )

      // If body changed, re-parse mentions
      if (input.body !== undefined) {
        // Delete old mentions
        mentionsRepository.deleteByComment(id)

        // Parse new mentions
        const mentions = parseMentions(input.body)

        // Get ticket info for event logging
        const comment = db
          .prepare('SELECT ticket_id FROM comments WHERE id = ?')
          .get(id) as { ticket_id: number } | undefined
        const ticket = comment
          ? (db
              .prepare('SELECT project_id FROM tickets WHERE id = ?')
              .get(comment.ticket_id) as { project_id: string } | undefined)
          : undefined

        // Create new mention records
        for (const name of mentions.profileNames) {
          const profile = profilesRepository.getByName(name)
          if (profile) {
            mentionsRepository.create({
              comment_id: id,
              mention_type: 'profile',
              mentioned_profile_id: profile.id,
              mention_text: `@${name}`,
            })
          }
        }

        // Create new ticket mention records
        for (const mentionedTicketId of mentions.ticketIds) {
          const mentionedTicket = db
            .prepare('SELECT id FROM tickets WHERE id = ?')
            .get(mentionedTicketId) as { id: number } | undefined

          if (!mentionedTicket) {
            continue
          }

          mentionsRepository.create({
            comment_id: id,
            mention_type: 'ticket',
            mentioned_ticket_id: mentionedTicketId,
            mention_text: `#${mentionedTicketId}`,
          })
        }

        // Create comment.edited event
        if (comment && ticket) {
          eventsRepository.create({
            event_type: 'comment.edited',
            project_id: ticket.project_id,
            ticket_id: comment.ticket_id,
            comment_id: id,
            actor_id: existingRow.author_id,
            actor_type: 'user',
            payload: { comment_id: id },
          })
        }
      }
    })

    updateComment()
    return this.get(id)
  },

  /**
   * Delete a comment
   */
  delete(id: number): boolean {
    const db = getDatabase()
    // Mentions are deleted via ON DELETE CASCADE
    const result = db.prepare('DELETE FROM comments WHERE id = ?').run(id)
    return result.changes > 0
  },

  /**
   * Get reply count for a comment
   */
  getReplyCount(id: number): number {
    const db = getDatabase()
    const row = db
      .prepare('SELECT COUNT(*) as count FROM comments WHERE parent_id = ?')
      .get(id) as { count: number }
    return row.count
  },
}
