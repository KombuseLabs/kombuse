import type {
  ActorType,
  Comment,
  CommentWithAuthor,
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
  kombuse_session_id: string | null
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

// Raw comment with joined profile columns
interface RawCommentWithAuthor extends RawComment {
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
}

const COMMENT_WITH_AUTHOR_SELECT = `
  SELECT c.*,
    p.type AS author_type, p.name AS author_name, p.email AS author_email,
    p.description AS author_description, p.avatar_url AS author_avatar_url,
    p.external_source AS author_external_source, p.external_id AS author_external_id,
    p.is_active AS author_is_active, p.created_at AS author_created_at,
    p.updated_at AS author_updated_at
  FROM comments c
  JOIN profiles p ON p.id = c.author_id
`

// Map database row with joined profile to CommentWithAuthor type
function mapCommentWithAuthor(row: RawCommentWithAuthor): CommentWithAuthor {
  return {
    ...mapComment(row),
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
  }
}

interface ParsedMentions {
  /** Profile IDs from new @[name](id) format */
  profileIds: string[]
  /** Profile names from legacy @name format (backward compat) */
  legacyProfileNames: string[]
  ticketIds: number[]
}

/**
 * Extract profile and ticket mentions from comment body.
 * Supports new `@[Display Name](profile-id)` format and legacy `@name` format,
 * plus `#123` ticket references.
 */
function parseMentions(body: string): ParsedMentions {
  // New format: @[Display Name](profile-id)
  const newProfileMentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g
  // Legacy format: @single-word-name
  const legacyProfileMentionRegex = /@([a-zA-Z0-9_-]+)/g
  const ticketMentionRegex = /#(\d+)\b/g

  const profileIds = [
    ...new Set(
      [...body.matchAll(newProfileMentionRegex)].map((match) => match[2]!)
    ),
  ]

  // Strip new-format mentions before running legacy regex to prevent double-matching
  const bodyWithoutNewMentions = body.replace(newProfileMentionRegex, '')
  const legacyProfileNames = [
    ...new Set(
      [...bodyWithoutNewMentions.matchAll(legacyProfileMentionRegex)].map(
        (match) => match[1]!
      )
    ),
  ]

  const ticketIds = [
    ...new Set(
      [...body.matchAll(ticketMentionRegex)]
        .map((match) => Number.parseInt(match[1]!, 10))
        .filter((ticketId) => Number.isInteger(ticketId) && ticketId > 0)
    ),
  ]

  return { profileIds, legacyProfileNames, ticketIds }
}

/**
 * Data access layer for comments
 */
export const commentsRepository = {
  /**
   * List all comments with optional filters
   */
  list(filters?: CommentFilters): CommentWithAuthor[] {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.ticket_id) {
      conditions.push('c.ticket_id = ?')
      params.push(filters.ticket_id)
    }
    if (filters?.author_id) {
      conditions.push('c.author_id = ?')
      params.push(filters.author_id)
    }
    if (filters?.parent_id !== undefined) {
      if (filters.parent_id === null) {
        conditions.push('c.parent_id IS NULL')
      } else {
        conditions.push('c.parent_id = ?')
        params.push(filters.parent_id)
      }
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const limit = filters?.limit || 100
    const offset = filters?.offset || 0

    const stmt = db.prepare(`
      ${COMMENT_WITH_AUTHOR_SELECT}
      ${whereClause}
      ORDER BY c.created_at ASC
      LIMIT ? OFFSET ?
    `)

    const rows = stmt.all(...params, limit, offset) as RawCommentWithAuthor[]
    return rows.map(mapCommentWithAuthor)
  },

  /**
   * Get a single comment by ID
   */
  get(id: number): CommentWithAuthor | null {
    const db = getDatabase()
    const row = db
      .prepare(`${COMMENT_WITH_AUTHOR_SELECT} WHERE c.id = ?`)
      .get(id) as RawCommentWithAuthor | undefined
    return row ? mapCommentWithAuthor(row) : null
  },

  /**
   * Get all comments for a ticket (chronological order)
   */
  getByTicket(ticketId: number): CommentWithAuthor[] {
    const db = getDatabase()
    const rows = db
      .prepare(`${COMMENT_WITH_AUTHOR_SELECT} WHERE c.ticket_id = ? ORDER BY c.created_at ASC`)
      .all(ticketId) as RawCommentWithAuthor[]
    return rows.map(mapCommentWithAuthor)
  },

  /**
   * Create a new comment with automatic profile/ticket mention parsing.
   */
  create(input: CreateCommentInput): CommentWithAuthor {
    const db = getDatabase()

    const insertComment = db.prepare(`
      INSERT INTO comments (
        ticket_id, author_id, parent_id, kombuse_session_id, body,
        external_source, external_id, is_edited
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
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
        payload.kombuse_session_id ?? null,
        payload.body,
        payload.external_source ?? null,
        payload.external_id ?? null
      )
      const commentId = result.lastInsertRowid as number

      // Determine actor type from author profile for event logging
      const authorProfile = profilesRepository.get(payload.author_id)
      const actorType: ActorType = authorProfile?.type === 'agent' ? 'agent' : 'user'

      // 2. Parse profile/ticket mentions from body
      const mentions = parseMentions(payload.body)

      // 3a. Resolve new-format profile mentions (by ID)
      for (const profileId of mentions.profileIds) {
        const profile = profilesRepository.get(profileId)
        if (profile) {
          mentionsRepository.create({
            comment_id: commentId,
            mention_type: 'profile',
            mentioned_profile_id: profile.id,
            mention_text: `@${profile.name}`,
          })

          eventsRepository.create({
            event_type: 'mention.created',
            project_id: ticket?.project_id,
            ticket_id: payload.ticket_id,
            comment_id: commentId,
            actor_id: payload.author_id,
            actor_type: actorType,
            kombuse_session_id: payload.kombuse_session_id,
            payload: {
              mention_type: 'profile',
              mentioned_profile_id: profile.id,
              mention_text: `@${profile.name}`,
            },
          })
        }
      }

      // 3b. Resolve legacy-format profile mentions (by name, backward compat)
      for (const name of mentions.legacyProfileNames) {
        const profile = profilesRepository.getByName(name)
        if (profile) {
          mentionsRepository.create({
            comment_id: commentId,
            mention_type: 'profile',
            mentioned_profile_id: profile.id,
            mention_text: `@${name}`,
          })

          eventsRepository.create({
            event_type: 'mention.created',
            project_id: ticket?.project_id,
            ticket_id: payload.ticket_id,
            comment_id: commentId,
            actor_id: payload.author_id,
            actor_type: actorType,
            kombuse_session_id: payload.kombuse_session_id,
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
          actor_type: actorType,
          kombuse_session_id: payload.kombuse_session_id,
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
        actor_type: actorType,
        kombuse_session_id: payload.kombuse_session_id,
        payload: {
          comment_id: commentId,
          ticket_id: payload.ticket_id,
        },
      })

      return commentId
    })

    const commentId = createComment(input)
    return this.get(commentId) as CommentWithAuthor
  },

  /**
   * Update an existing comment
   */
  update(id: number, input: UpdateCommentInput): CommentWithAuthor | null {
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

    if (fields.length === 0) return this.get(id)

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

        // Create new mention records (new format, by ID)
        for (const profileId of mentions.profileIds) {
          const profile = profilesRepository.get(profileId)
          if (profile) {
            mentionsRepository.create({
              comment_id: id,
              mention_type: 'profile',
              mentioned_profile_id: profile.id,
              mention_text: `@${profile.name}`,
            })
          }
        }

        // Create new mention records (legacy format, by name)
        for (const name of mentions.legacyProfileNames) {
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
          const authorProfile = profilesRepository.get(existingRow.author_id)
          const editActorType: ActorType =
            authorProfile?.type === 'agent' ? 'agent' : 'user'
          eventsRepository.create({
            event_type: 'comment.edited',
            project_id: ticket.project_id,
            ticket_id: comment.ticket_id,
            comment_id: id,
            actor_id: existingRow.author_id,
            actor_type: editActorType,
            kombuse_session_id: existingRow.kombuse_session_id ?? undefined,
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
