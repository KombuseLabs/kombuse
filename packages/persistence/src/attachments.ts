import type {
  Attachment,
  AttachmentFilters,
  CreateAttachmentInput,
} from '@kombuse/types'
import { getDatabase } from './database'

/**
 * Data access layer for attachments
 */
export const attachmentsRepository = {
  /**
   * List attachments with optional filters
   */
  list(filters?: AttachmentFilters): Attachment[] {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.comment_id) {
      conditions.push('comment_id = ?')
      params.push(filters.comment_id)
    }
    if (filters?.ticket_id) {
      conditions.push('ticket_id = ?')
      params.push(filters.ticket_id)
    }
    if (filters?.uploaded_by_id) {
      conditions.push('uploaded_by_id = ?')
      params.push(filters.uploaded_by_id)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const stmt = db.prepare(`
      SELECT * FROM attachments
      ${whereClause}
      ORDER BY created_at ASC
    `)

    return stmt.all(...params) as Attachment[]
  },

  /**
   * Get a single attachment by ID
   */
  get(id: number): Attachment | null {
    const db = getDatabase()
    const attachment = db
      .prepare('SELECT * FROM attachments WHERE id = ?')
      .get(id) as Attachment | undefined
    return attachment ?? null
  },

  /**
   * Get all attachments for a ticket
   */
  getByTicket(ticketId: number): Attachment[] {
    const db = getDatabase()
    return db
      .prepare(
        'SELECT * FROM attachments WHERE ticket_id = ? ORDER BY created_at ASC'
      )
      .all(ticketId) as Attachment[]
  },

  /**
   * Get all attachments for a comment
   */
  getByComment(commentId: number): Attachment[] {
    const db = getDatabase()
    return db
      .prepare(
        'SELECT * FROM attachments WHERE comment_id = ? ORDER BY created_at ASC'
      )
      .all(commentId) as Attachment[]
  },

  /**
   * Create a new attachment record
   */
  create(input: CreateAttachmentInput): Attachment {
    const db = getDatabase()

    const result = db
      .prepare(
        `
      INSERT INTO attachments (comment_id, ticket_id, filename, mime_type, size_bytes, storage_path, uploaded_by_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        input.comment_id ?? null,
        input.ticket_id ?? null,
        input.filename,
        input.mime_type,
        input.size_bytes,
        input.storage_path,
        input.uploaded_by_id
      )

    return this.get(result.lastInsertRowid as number) as Attachment
  },

  /**
   * Delete an attachment record
   */
  delete(id: number): boolean {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM attachments WHERE id = ?').run(id)
    return result.changes > 0
  },
}
