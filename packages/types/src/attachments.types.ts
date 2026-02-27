import type { z } from 'zod'
import type { attachmentMetaSchema, attachmentSchema } from './schemas/entities'

// Derived from Zod schemas (single source of truth)
export type AttachmentMeta = z.infer<typeof attachmentMetaSchema>
export type Attachment = z.infer<typeof attachmentSchema>

/**
 * Input for creating an attachment
 */
export interface CreateAttachmentInput {
  comment_id?: number
  ticket_id?: number
  filename: string
  mime_type: string
  size_bytes: number
  storage_path: string
  uploaded_by_id: string
}

/**
 * Filters for listing attachments
 */
export interface AttachmentFilters {
  comment_id?: number
  ticket_id?: number
  uploaded_by_id?: string
}
