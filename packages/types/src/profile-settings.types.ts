import type { z } from 'zod'
import type { profileSettingSchema } from './schemas/entities'

// Derived from Zod schemas (single source of truth)
export type ProfileSetting = z.infer<typeof profileSettingSchema>

/**
 * Input for creating or updating a setting value.
 */
export interface UpsertProfileSettingInput {
  profile_id: string
  setting_key: string
  setting_value: string
}

/**
 * Filters for listing settings.
 */
export interface ProfileSettingFilters {
  profile_id?: string
  setting_key?: string
  limit?: number
  offset?: number
}
