/**
 * Profile type discriminator
 */
export type ProfileType = 'user' | 'agent'

/**
 * Core profile entity (users and agents)
 */
export interface Profile {
  id: string
  type: ProfileType
  name: string
  email: string | null
  description: string | null
  avatar_url: string | null
  external_source: string | null
  external_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/**
 * Input for creating a profile
 */
export interface CreateProfileInput {
  id?: string
  type: ProfileType
  name: string
  email?: string
  description?: string
  avatar_url?: string
  external_source?: string
  external_id?: string
}

/**
 * Input for updating a profile
 */
export interface UpdateProfileInput {
  name?: string
  email?: string
  description?: string
  avatar_url?: string
  is_active?: boolean
}

/**
 * Filters for listing profiles
 */
export interface ProfileFilters {
  type?: ProfileType
  is_active?: boolean
  search?: string
  limit?: number
  offset?: number
}

/**
 * Well-known profile IDs for system use
 */
export const ANONYMOUS_AGENT_ID = 'anonymous-agent'
