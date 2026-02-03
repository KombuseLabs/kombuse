/**
 * Core attachment entity
 */
export interface Attachment {
  id: number
  comment_id: number | null
  ticket_id: number | null
  filename: string
  mime_type: string
  size_bytes: number
  storage_path: string
  uploaded_by_id: string
  created_at: string
}

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
