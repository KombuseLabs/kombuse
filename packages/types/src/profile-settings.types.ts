/**
 * Per-profile key-value setting.
 */
export interface ProfileSetting {
  id: number
  profile_id: string
  setting_key: string
  setting_value: string
  created_at: string
  updated_at: string
}

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
