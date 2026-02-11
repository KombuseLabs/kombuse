/**
 * @fileoverview Tests for profiles repository CRUD operations
 *
 * Run all: bun run --filter @kombuse/persistence test -- src/__tests__/profiles.test.ts
 * Run one: bun run --filter @kombuse/persistence test -- -t "should create a user profile"
 *
 * Tests cover:
 * - create: Insert new profiles (users and agents) with required/optional fields
 * - get: Retrieve single profile by ID, email, name, or external ID
 * - list: Query profiles with filters, search, pagination
 * - update: Modify existing profiles
 * - delete: Soft delete profiles (set is_active = false)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { setupTestDb } from '../test-utils'
import { profilesRepository } from '../profiles'

// Helper to generate unique emails
let emailCounter = 0
function uniqueEmail() {
  return `test-${++emailCounter}-${Date.now()}@example.com`
}

// Helper to generate unique names
let nameCounter = 0
function uniqueName(base: string) {
  return `${base}-${++nameCounter}-${Date.now()}`
}

const NON_EXISTENT_ID = 'non-existent-id-12345'

describe('profilesRepository', () => {
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

  /*
   * CREATE TESTS
   */
  describe('create', () => {
    it('should create a user profile with required fields', () => {
      const email = uniqueEmail()
      const profile = profilesRepository.create({
        type: 'user',
        name: 'Test User',
        email,
      })

      expect(profile.id, 'Profile should have auto-generated ID').toBeDefined()
      expect(profile.type).toBe('user')
      expect(profile.name).toBe('Test User')
      expect(profile.email).toBe(email)
      expect(profile.is_active, 'New profiles should be active').toBe(true)
    })

    it('should create an agent profile with description', () => {
      const profile = profilesRepository.create({
        type: 'agent',
        name: uniqueName('Test Agent'),
        description: 'An AI assistant for testing',
      })

      expect(profile.type).toBe('agent')
      expect(profile.description).toBe('An AI assistant for testing')
      expect(profile.email, 'Agents typically have no email').toBeNull()
    })

    it('should use provided ID when specified', () => {
      const customId = `custom-profile-${Date.now()}`
      const profile = profilesRepository.create({
        type: 'user',
        name: 'Custom ID User',
        email: uniqueEmail(),
        id: customId,
      })

      expect(profile.id).toBe(customId)
    })

    it('should create profile with external source and ID', () => {
      const profile = profilesRepository.create({
        type: 'user',
        name: 'External User',
        email: uniqueEmail(),
        external_source: 'github',
        external_id: `gh-${Date.now()}`,
      })

      expect(profile.external_source).toBe('github')
      expect(profile.external_id).toContain('gh-')
    })

    it('should auto-generate timestamps on creation', () => {
      const profile = profilesRepository.create({
        type: 'user',
        name: 'Timestamp User',
        email: uniqueEmail(),
      })

      expect(profile.created_at, 'created_at should be set').toBeDefined()
      expect(profile.updated_at, 'updated_at should be set').toBeDefined()
      expect(() => new Date(profile.created_at)).not.toThrow()
    })
  })

  /*
   * GET TESTS
   */
  describe('get', () => {
    it('should return null for non-existent profile ID', () => {
      const profile = profilesRepository.get(NON_EXISTENT_ID)

      expect(profile).toBeNull()
    })

    it('should return profile by ID', () => {
      const created = profilesRepository.create({
        type: 'user',
        name: 'Get Test User',
        email: uniqueEmail(),
      })

      const profile = profilesRepository.get(created.id)

      expect(profile).not.toBeNull()
      expect(profile?.id).toBe(created.id)
      expect(profile?.name).toBe('Get Test User')
    })
  })

  describe('getByEmail', () => {
    it('should return profile by email', () => {
      const email = uniqueEmail()
      profilesRepository.create({
        type: 'user',
        name: 'Email User',
        email,
      })

      const profile = profilesRepository.getByEmail(email)

      expect(profile).not.toBeNull()
      expect(profile?.email).toBe(email)
    })

    it('should return null for non-existent email', () => {
      const profile = profilesRepository.getByEmail('nobody@example.com')

      expect(profile).toBeNull()
    })
  })

  describe('getByName', () => {
    it('should return profile by name', () => {
      const name = uniqueName('Named Agent')
      profilesRepository.create({
        type: 'agent',
        name,
        description: 'Test agent',
      })

      const profile = profilesRepository.getByName(name)

      expect(profile).not.toBeNull()
      expect(profile?.name).toBe(name)
    })

    it('should only return active profiles', () => {
      const name = uniqueName('Deletable Agent')
      const created = profilesRepository.create({
        type: 'agent',
        name,
      })
      profilesRepository.delete(created.id) // Soft delete

      const profile = profilesRepository.getByName(name)

      expect(profile, 'Inactive profiles should not be found by name').toBeNull()
    })
  })

  describe('getByExternalId', () => {
    it('should return profile by external source and ID', () => {
      const externalId = `gh-${Date.now()}`
      profilesRepository.create({
        type: 'user',
        name: 'GitHub User',
        email: uniqueEmail(),
        external_source: 'github',
        external_id: externalId,
      })

      const profile = profilesRepository.getByExternalId('github', externalId)

      expect(profile).not.toBeNull()
      expect(profile?.external_source).toBe('github')
      expect(profile?.external_id).toBe(externalId)
    })

    it('should return null for non-matching source', () => {
      const externalId = `gh-${Date.now()}`
      profilesRepository.create({
        type: 'user',
        name: 'GitHub Only User',
        email: uniqueEmail(),
        external_source: 'github',
        external_id: externalId,
      })

      const profile = profilesRepository.getByExternalId('gitlab', externalId)

      expect(profile).toBeNull()
    })
  })

  /*
   * LIST TESTS
   */
  describe('list', () => {
    beforeEach(() => {
      // Seed data for list tests with unique values
      profilesRepository.create({ type: 'user', name: 'List User 1', email: uniqueEmail() })
      profilesRepository.create({ type: 'user', name: 'List User 2', email: uniqueEmail() })
      profilesRepository.create({ type: 'agent', name: 'List Agent 1' })
    })

    it('should return all profiles when no filters provided', () => {
      const profiles = profilesRepository.list()

      // 3 created + seeded TEST_USER_ID and TEST_AGENT_ID from test-utils
      expect(profiles.length).toBeGreaterThanOrEqual(3)
    })

    it('should filter profiles by type', () => {
      const agents = profilesRepository.list({ type: 'agent' })

      expect(agents.length).toBeGreaterThanOrEqual(1)
      expect(agents.every((p) => p.type === 'agent')).toBe(true)
    })

    it('should filter profiles by is_active', () => {
      const user = profilesRepository.create({
        type: 'user',
        name: 'Inactive User',
        email: uniqueEmail(),
      })
      profilesRepository.delete(user.id) // Soft delete

      const activeProfiles = profilesRepository.list({ is_active: true })
      const inactiveProfiles = profilesRepository.list({ is_active: false })

      expect(activeProfiles.every((p) => p.is_active)).toBe(true)
      expect(inactiveProfiles.every((p) => !p.is_active)).toBe(true)
    })

    it('should search profiles by name', () => {
      const results = profilesRepository.list({ search: 'List Agent' })

      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.some((p) => p.name.includes('List Agent'))).toBe(true)
    })

    it('should limit number of returned profiles', () => {
      const profiles = profilesRepository.list({ limit: 2 })

      expect(profiles).toHaveLength(2)
    })

    it('should support pagination with offset', () => {
      const page1 = profilesRepository.list({ limit: 2, offset: 0 })
      const page2 = profilesRepository.list({ limit: 2, offset: 2 })

      expect(page1).toHaveLength(2)
      // Verify no overlap
      const page1Ids = page1.map((p) => p.id)
      const page2Ids = page2.map((p) => p.id)
      expect(page1Ids.filter((id) => page2Ids.includes(id))).toHaveLength(0)
    })
  })

  /*
   * UPDATE TESTS
   */
  describe('update', () => {
    it('should update profile name', () => {
      const profile = profilesRepository.create({
        type: 'user',
        name: 'Original Name',
        email: uniqueEmail(),
      })

      const updated = profilesRepository.update(profile.id, { name: 'Updated Name' })

      expect(updated?.name).toBe('Updated Name')
    })

    it('should return null when updating non-existent profile', () => {
      const result = profilesRepository.update(NON_EXISTENT_ID, { name: 'New' })

      expect(result).toBeNull()
    })

    it('should support partial updates - only specified fields change', () => {
      const email = uniqueEmail()
      const profile = profilesRepository.create({
        type: 'user',
        name: 'Partial Update User',
        email,
        description: 'Original description',
      })

      const updated = profilesRepository.update(profile.id, { name: 'New Name' })

      expect(updated?.name).toBe('New Name')
      expect(updated?.description, 'Description should remain unchanged').toBe('Original description')
      expect(updated?.email, 'Email should remain unchanged').toBe(email)
    })

    it('should return existing profile when update has no fields', () => {
      const profile = profilesRepository.create({
        type: 'user',
        name: 'No Update User',
        email: uniqueEmail(),
      })

      const result = profilesRepository.update(profile.id, {})

      expect(result?.id).toBe(profile.id)
      expect(result?.name).toBe(profile.name)
    })

    it('should update is_active flag', () => {
      const profile = profilesRepository.create({
        type: 'user',
        name: 'Deactivate User',
        email: uniqueEmail(),
      })

      const updated = profilesRepository.update(profile.id, { is_active: false })

      expect(updated?.is_active).toBe(false)
    })
  })

  /*
   * BATCH GET TESTS
   */
  describe('getByIds', () => {
    it('should return empty map for empty input', () => {
      const result = profilesRepository.getByIds([])
      expect(result.size).toBe(0)
    })

    it('should return profiles for valid IDs', () => {
      const p1 = profilesRepository.create({ type: 'user', name: 'Batch User 1', email: uniqueEmail() })
      const p2 = profilesRepository.create({ type: 'agent', name: 'Batch Agent 1' })

      const result = profilesRepository.getByIds([p1.id, p2.id])

      expect(result.size).toBe(2)
      expect(result.get(p1.id)!.name).toBe('Batch User 1')
      expect(result.get(p2.id)!.name).toBe('Batch Agent 1')
    })

    it('should skip non-existent IDs', () => {
      const p1 = profilesRepository.create({ type: 'user', name: 'Batch User 2', email: uniqueEmail() })

      const result = profilesRepository.getByIds([p1.id, 'non-existent-id'])

      expect(result.size).toBe(1)
      expect(result.has('non-existent-id')).toBe(false)
    })

    it('should deduplicate IDs', () => {
      const p1 = profilesRepository.create({ type: 'user', name: 'Batch User 3', email: uniqueEmail() })

      const result = profilesRepository.getByIds([p1.id, p1.id])

      expect(result.size).toBe(1)
    })
  })

  /*
   * DELETE TESTS (soft delete)
   */
  describe('delete', () => {
    it('should soft delete existing profile and return true', () => {
      const profile = profilesRepository.create({
        type: 'user',
        name: 'Delete User',
        email: uniqueEmail(),
      })

      const deleted = profilesRepository.delete(profile.id)

      expect(deleted, 'Delete should return true for existing profile').toBe(true)

      const fetched = profilesRepository.get(profile.id)
      expect(fetched, 'Profile should still exist').not.toBeNull()
      expect(fetched?.is_active, 'Profile should be marked inactive').toBe(false)
    })

    it('should return false when deleting non-existent profile', () => {
      const deleted = profilesRepository.delete(NON_EXISTENT_ID)

      expect(deleted, 'Delete should return false for non-existent ID').toBe(false)
    })
  })
})
