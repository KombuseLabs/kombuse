import type { Profile } from './profiles'
import type { AttachmentMeta } from './attachments'

/**
 * Core comment entity
 */
export interface Comment {
  id: number
  ticket_id: number
  author_id: string
  parent_id: number | null
  kombuse_session_id: string | null
  body: string
  external_source: string | null
  external_id: string | null
  synced_at: string | null
  is_edited: boolean
  created_at: string
  updated_at: string
}

/**
 * Comment with author profile
 */
export interface CommentWithAuthor extends Comment {
  author: Profile
}

/**
 * Comment with author profile and attachment metadata
 */
export interface CommentWithAuthorAndAttachments extends CommentWithAuthor {
  attachments: AttachmentMeta[]
}

/**
 * Input for creating a comment
 */
export interface CreateCommentInput {
  ticket_id: number
  author_id: string
  parent_id?: number
  kombuse_session_id?: string
  body: string
  external_source?: string
  external_id?: string
}

/**
 * Input for updating a comment
 */
export interface UpdateCommentInput {
  body?: string
}

/**
 * Filters for listing comments
 */
export interface CommentFilters {
  ticket_id?: number
  author_id?: string
  parent_id?: number | null
  kombuse_session_id?: string
  limit?: number
  offset?: number
}
