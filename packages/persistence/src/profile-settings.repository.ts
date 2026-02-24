import type {
  ProfileSetting,
  ProfileSettingFilters,
  UpsertProfileSettingInput,
} from '@kombuse/types'
import { getDatabase } from './database'

/**
 * Data access layer for per-profile key-value settings.
 */
export const profileSettingsRepository = {
  /**
   * List settings with optional filters.
   */
  list(filters?: ProfileSettingFilters): ProfileSetting[] {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.profile_id) {
      conditions.push('profile_id = ?')
      params.push(filters.profile_id)
    }
    if (filters?.setting_key) {
      conditions.push('setting_key = ?')
      params.push(filters.setting_key)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = filters?.limit ?? 100
    const offset = filters?.offset ?? 0

    return db
      .prepare(
        `
        SELECT * FROM profile_settings
        ${whereClause}
        ORDER BY setting_key ASC
        LIMIT ? OFFSET ?
      `
      )
      .all(...params, limit, offset) as ProfileSetting[]
  },

  /**
   * Get a single profile setting by key.
   */
  get(profileId: string, settingKey: string): ProfileSetting | null {
    const db = getDatabase()
    const row = db
      .prepare(
        `
        SELECT * FROM profile_settings
        WHERE profile_id = ? AND setting_key = ?
      `
      )
      .get(profileId, settingKey) as ProfileSetting | undefined
    return row ?? null
  },

  /**
   * Get all settings for a profile.
   */
  getByProfile(profileId: string): ProfileSetting[] {
    const db = getDatabase()
    return db
      .prepare(
        `
        SELECT * FROM profile_settings
        WHERE profile_id = ?
        ORDER BY setting_key ASC
      `
      )
      .all(profileId) as ProfileSetting[]
  },

  /**
   * Create or update a setting.
   */
  upsert(input: UpsertProfileSettingInput): ProfileSetting {
    const db = getDatabase()
    db.prepare(
      `
      INSERT INTO profile_settings (profile_id, setting_key, setting_value)
      VALUES (?, ?, ?)
      ON CONFLICT(profile_id, setting_key)
      DO UPDATE SET
        setting_value = excluded.setting_value,
        updated_at = datetime('now')
    `
    ).run(input.profile_id, input.setting_key, input.setting_value)

    return this.get(input.profile_id, input.setting_key) as ProfileSetting
  },

  /**
   * Delete one profile setting by key.
   */
  delete(profileId: string, settingKey: string): boolean {
    const db = getDatabase()
    const result = db
      .prepare(
        `
        DELETE FROM profile_settings
        WHERE profile_id = ? AND setting_key = ?
      `
      )
      .run(profileId, settingKey)
    return result.changes > 0
  },

  /**
   * Delete all settings for a profile.
   */
  deleteByProfile(profileId: string): number {
    const db = getDatabase()
    const result = db
      .prepare('DELETE FROM profile_settings WHERE profile_id = ?')
      .run(profileId)
    return result.changes
  },
}
