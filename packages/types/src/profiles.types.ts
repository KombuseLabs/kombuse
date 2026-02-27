import type { z } from 'zod'
import type { profileTypeSchema, profileSchema } from './schemas/entities'

// Derived from Zod schemas (single source of truth)
export type ProfileType = z.infer<typeof profileTypeSchema>
export type Profile = z.infer<typeof profileSchema>

/**
 * Input for creating a profile
 */
export interface CreateProfileInput {
  id?: string
  type: ProfileType
  name: string
  slug?: string
  email?: string
  description?: string
  avatar_url?: string
  external_source?: string
  external_id?: string
  plugin_id?: string | null
}

/**
 * Input for updating a profile
 */
export interface UpdateProfileInput {
  name?: string
  slug?: string | null
  email?: string
  description?: string
  avatar_url?: string
  plugin_id?: string | null
  is_active?: boolean
}

/**
 * Filters for listing profiles
 */
export interface ProfileFilters {
  type?: ProfileType
  is_active?: boolean
  search?: string
  has_agent?: boolean
  project_id?: string
  limit?: number
  offset?: number
}

/**
 * Well-known profile IDs for system use
 */
export const ANONYMOUS_AGENT_ID = 'anonymous-agent'
