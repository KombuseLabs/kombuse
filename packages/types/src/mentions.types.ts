import type { Profile } from './profiles.types'

/**
 * Core mention entity
 */
export type MentionType = 'profile' | 'ticket'

interface MentionBase {
  id: number
  comment_id: number
  mention_type: MentionType
  mention_text: string
  created_at: string
}

export interface ProfileMention extends MentionBase {
  mention_type: 'profile'
  mentioned_profile_id: string
  mentioned_ticket_id: null
}

export interface TicketMention extends MentionBase {
  mention_type: 'ticket'
  mentioned_profile_id: null
  mentioned_ticket_id: number
}

export type Mention = ProfileMention | TicketMention

/**
 * Mention with profile info
 */
export interface MentionWithProfile extends ProfileMention {
  mentioned: Profile
}

/**
 * Input for creating a mention
 */
export type CreateMentionInput =
  | {
      comment_id: number
      mention_type: 'profile'
      mentioned_profile_id: string
      mention_text: string
    }
  | {
      comment_id: number
      mention_type: 'ticket'
      mentioned_ticket_id: number
      mention_text: string
    }

/**
 * Filters for listing mentions
 */
export interface MentionFilters {
  comment_id?: number
  mention_type?: MentionType
  mentioned_profile_id?: string
  mentioned_ticket_id?: number
}
