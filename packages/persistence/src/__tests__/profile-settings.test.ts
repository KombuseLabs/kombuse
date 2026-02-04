import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { setupTestDb, TEST_USER_ID } from '../test-utils'
import { profileSettingsRepository } from '../profile-settings'

describe('profileSettingsRepository', () => {
  let cleanup: () => void
  let db: DatabaseType

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    db = setup.db
  })

  afterEach(() => {
    cleanup()
  })

  describe('upsert', () => {
    it('should create a profile setting', () => {
      const setting = profileSettingsRepository.upsert({
        profile_id: TEST_USER_ID,
        setting_key: 'theme',
        setting_value: 'light',
      })

      expect(setting.profile_id).toBe(TEST_USER_ID)
      expect(setting.setting_key).toBe('theme')
      expect(setting.setting_value).toBe('light')
    })

    it('should update an existing profile setting', () => {
      profileSettingsRepository.upsert({
        profile_id: TEST_USER_ID,
        setting_key: 'theme',
        setting_value: 'light',
      })

      const updated = profileSettingsRepository.upsert({
        profile_id: TEST_USER_ID,
        setting_key: 'theme',
        setting_value: 'dark',
      })

      expect(updated.setting_value).toBe('dark')
    })
  })

  describe('list/get', () => {
    beforeEach(() => {
      profileSettingsRepository.upsert({
        profile_id: TEST_USER_ID,
        setting_key: 'theme',
        setting_value: 'light',
      })
      profileSettingsRepository.upsert({
        profile_id: TEST_USER_ID,
        setting_key: 'locale',
        setting_value: 'en-US',
      })
    })

    it('should get a setting by profile and key', () => {
      const setting = profileSettingsRepository.get(TEST_USER_ID, 'theme')
      expect(setting?.setting_value).toBe('light')
    })

    it('should list settings by profile', () => {
      const settings = profileSettingsRepository.list({ profile_id: TEST_USER_ID })
      expect(settings).toHaveLength(2)
    })

    it('should filter settings by key', () => {
      const settings = profileSettingsRepository.list({ setting_key: 'theme' })
      expect(settings).toHaveLength(1)
      expect(settings[0]?.setting_key).toBe('theme')
    })
  })

  describe('delete', () => {
    it('should delete a single setting', () => {
      profileSettingsRepository.upsert({
        profile_id: TEST_USER_ID,
        setting_key: 'theme',
        setting_value: 'light',
      })

      const deleted = profileSettingsRepository.delete(TEST_USER_ID, 'theme')
      expect(deleted).toBe(true)
      expect(profileSettingsRepository.get(TEST_USER_ID, 'theme')).toBeNull()
    })

    it('should delete all settings by profile', () => {
      profileSettingsRepository.upsert({
        profile_id: TEST_USER_ID,
        setting_key: 'theme',
        setting_value: 'light',
      })
      profileSettingsRepository.upsert({
        profile_id: TEST_USER_ID,
        setting_key: 'locale',
        setting_value: 'en-US',
      })

      const deletedCount = profileSettingsRepository.deleteByProfile(TEST_USER_ID)
      expect(deletedCount).toBe(2)
      expect(profileSettingsRepository.getByProfile(TEST_USER_ID)).toHaveLength(0)
    })

    it('should cascade delete settings when profile is deleted', () => {
      // Create an isolated profile with no other dependencies
      const isolatedProfileId = 'cascade-test-profile'
      db.prepare(`
        INSERT INTO profiles (id, type, name)
        VALUES (?, 'user', 'Cascade Test User')
      `).run(isolatedProfileId)

      profileSettingsRepository.upsert({
        profile_id: isolatedProfileId,
        setting_key: 'theme',
        setting_value: 'light',
      })

      db.prepare('DELETE FROM profiles WHERE id = ?').run(isolatedProfileId)

      expect(profileSettingsRepository.getByProfile(isolatedProfileId)).toHaveLength(0)
    })
  })
})
