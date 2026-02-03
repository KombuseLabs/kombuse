import type { Profile } from './profiles'

/**
 * Core mention entity
 */
export interface Mention {
  id: number
  comment_id: number
  mentioned_id: string
  mention_text: string
  created_at: string
}

/**
 * Mention with profile info
 */
export interface MentionWithProfile extends Mention {
  mentioned: Profile
}

/**
 * Input for creating a mention
 */
export interface CreateMentionInput {
  comment_id: number
  mentioned_id: string
  mention_text: string
}

/**
 * Filters for listing mentions
 */
export interface MentionFilters {
  comment_id?: number
  mentioned_id?: string
}
