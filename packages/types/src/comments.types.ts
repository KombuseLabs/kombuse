import type { z } from 'zod'
import type {
  commentSchema,
  commentWithAuthorSchema,
  commentWithAuthorAndAttachmentsSchema,
} from './schemas/entities'
import type { ProfileType } from './profiles.types'

// Derived from Zod schemas (single source of truth)
export type Comment = z.infer<typeof commentSchema>
export type CommentWithAuthor = z.infer<typeof commentWithAuthorSchema>
export type CommentWithAuthorAndAttachments = z.infer<typeof commentWithAuthorAndAttachmentsSchema>

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
  author_ids?: string[]
  actor_types?: ProfileType[]
  agent_types?: string[]
  parent_id?: number | null
  kombuse_session_id?: string
  sort_order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}
