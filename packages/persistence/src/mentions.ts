import type {
  Mention,
  MentionFilters,
  CreateMentionInput,
} from '@kombuse/types'
import { getDatabase } from './database'

/**
 * Data access layer for mentions (@mentions in comments)
 */
export const mentionsRepository = {
  /**
   * List all mentions with optional filters
   */
  list(filters?: MentionFilters): Mention[] {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.comment_id) {
      conditions.push('comment_id = ?')
      params.push(filters.comment_id)
    }
    if (filters?.mentioned_id) {
      conditions.push('mentioned_id = ?')
      params.push(filters.mentioned_id)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const stmt = db.prepare(`
      SELECT * FROM mentions
      ${whereClause}
      ORDER BY created_at DESC
    `)

    return stmt.all(...params) as Mention[]
  },

  /**
   * Get a single mention by ID
   */
  get(id: number): Mention | null {
    const db = getDatabase()
    const mention = db
      .prepare('SELECT * FROM mentions WHERE id = ?')
      .get(id) as Mention | undefined
    return mention ?? null
  },

  /**
   * Get all mentions in a comment
   */
  getByComment(commentId: number): Mention[] {
    const db = getDatabase()
    return db
      .prepare('SELECT * FROM mentions WHERE comment_id = ? ORDER BY id ASC')
      .all(commentId) as Mention[]
  },

  /**
   * Get all mentions of a profile
   */
  getByProfile(profileId: string): Mention[] {
    const db = getDatabase()
    return db
      .prepare(
        'SELECT * FROM mentions WHERE mentioned_id = ? ORDER BY created_at DESC'
      )
      .all(profileId) as Mention[]
  },

  /**
   * Create a new mention
   */
  create(input: CreateMentionInput): Mention {
    const db = getDatabase()

    const result = db
      .prepare(
        `
      INSERT INTO mentions (comment_id, mentioned_id, mention_text)
      VALUES (?, ?, ?)
    `
      )
      .run(input.comment_id, input.mentioned_id, input.mention_text)

    return this.get(result.lastInsertRowid as number) as Mention
  },

  /**
   * Create multiple mentions at once (for efficiency)
   */
  createBatch(inputs: CreateMentionInput[]): Mention[] {
    if (inputs.length === 0) return []

    const db = getDatabase()
    const insertMention = db.prepare(`
      INSERT INTO mentions (comment_id, mentioned_id, mention_text)
      VALUES (?, ?, ?)
    `)

    const insertedIds: number[] = []

    const batchInsert = db.transaction((items: CreateMentionInput[]) => {
      for (const item of items) {
        const result = insertMention.run(
          item.comment_id,
          item.mentioned_id,
          item.mention_text
        )
        insertedIds.push(result.lastInsertRowid as number)
      }
    })

    batchInsert(inputs)

    return insertedIds.map((id) => this.get(id) as Mention)
  },

  /**
   * Delete a mention
   */
  delete(id: number): boolean {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM mentions WHERE id = ?').run(id)
    return result.changes > 0
  },

  /**
   * Delete all mentions for a comment
   */
  deleteByComment(commentId: number): number {
    const db = getDatabase()
    const result = db
      .prepare('DELETE FROM mentions WHERE comment_id = ?')
      .run(commentId)
    return result.changes
  },
}
