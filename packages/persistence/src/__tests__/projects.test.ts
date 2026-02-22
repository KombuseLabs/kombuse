/**
 * @fileoverview Tests for projects repository CRUD operations
 *
 * Run all: bun run --filter @kombuse/persistence test -- src/__tests__/projects.test.ts
 * Run one: bun run --filter @kombuse/persistence test -- -t "should create a project"
 *
 * Tests cover:
 * - create: Insert new projects with required/optional fields
 * - get: Retrieve single project by ID
 * - list: Query projects with filters, search, pagination
 * - update: Modify existing projects
 * - delete: Remove projects
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { setupTestDb, TEST_USER_ID } from '../test-utils'
import { projectsRepository } from '../projects'

// Test data constants
const TEST_PROJECT = {
  name: 'Test Project',
  owner_id: TEST_USER_ID,
}

const TEST_PROJECT_FULL = {
  name: 'Full Project',
  description: 'A complete project with all fields',
  owner_id: TEST_USER_ID,
  local_path: '/path/to/project',
}

const TEST_PROJECT_GITHUB = {
  name: 'GitHub Project',
  owner_id: TEST_USER_ID,
  repo_source: 'github' as const,
  repo_owner: 'octocat',
  repo_name: 'hello-world',
}

const NON_EXISTENT_ID = 'non-existent-project-id'

describe('projectsRepository', () => {
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
    it('should create a project with required fields only', () => {
      const project = projectsRepository.create(TEST_PROJECT)

      expect(project.id, 'Project should have auto-generated ID').toBeDefined()
      expect(project.name).toBe(TEST_PROJECT.name)
      expect(project.owner_id).toBe(TEST_USER_ID)
      expect(project.description).toBeNull()
      expect(project.local_path).toBeNull()
    })

    it('should create a project with all optional fields', () => {
      const project = projectsRepository.create(TEST_PROJECT_FULL)

      expect(project.name).toBe(TEST_PROJECT_FULL.name)
      expect(project.description).toBe(TEST_PROJECT_FULL.description)
      expect(project.local_path).toBe(TEST_PROJECT_FULL.local_path)
    })

    it('should create a project with GitHub repo fields', () => {
      const project = projectsRepository.create(TEST_PROJECT_GITHUB)

      expect(project.repo_source).toBe('github')
      expect(project.repo_owner).toBe('octocat')
      expect(project.repo_name).toBe('hello-world')
    })

    it('should use provided ID when specified', () => {
      const customId = 'my-custom-project-id'
      const project = projectsRepository.create({ ...TEST_PROJECT, id: customId })

      expect(project.id).toBe(customId)
    })

    it('should auto-generate timestamps on creation', () => {
      const project = projectsRepository.create(TEST_PROJECT)

      expect(project.created_at, 'created_at should be set').toBeDefined()
      expect(project.updated_at, 'updated_at should be set').toBeDefined()
      expect(() => new Date(project.created_at)).not.toThrow()
    })

    it('should auto-generate slug from name', () => {
      const project = projectsRepository.create(TEST_PROJECT)

      expect(project.slug).toBe('test-project')
    })

    it('should use explicit slug when provided', () => {
      const project = projectsRepository.create({ ...TEST_PROJECT, slug: 'my-custom-slug' })

      expect(project.slug).toBe('my-custom-slug')
    })

    it('should handle duplicate slugs with suffix', () => {
      const project1 = projectsRepository.create({ ...TEST_PROJECT, name: 'Duplicate' })
      const project2 = projectsRepository.create({ ...TEST_PROJECT, name: 'Duplicate' })

      expect(project1.slug).toBe('duplicate')
      expect(project2.slug).toBe('duplicate-2')
    })
  })

  /*
   * GET TESTS
   */
  describe('get', () => {
    it('should return null for non-existent project ID', () => {
      const project = projectsRepository.get(NON_EXISTENT_ID)

      expect(project).toBeNull()
    })

    it('should return project by ID', () => {
      const created = projectsRepository.create(TEST_PROJECT)

      const project = projectsRepository.get(created.id)

      expect(project).not.toBeNull()
      expect(project?.id).toBe(created.id)
      expect(project?.name).toBe(TEST_PROJECT.name)
    })
  })

  /*
   * GET BY SLUG TESTS
   */
  describe('getBySlug', () => {
    it('should return project by slug', () => {
      const created = projectsRepository.create(TEST_PROJECT)

      const project = projectsRepository.getBySlug(created.slug)

      expect(project).not.toBeNull()
      expect(project?.id).toBe(created.id)
    })

    it('should return null for non-existent slug', () => {
      const project = projectsRepository.getBySlug('non-existent-slug')

      expect(project).toBeNull()
    })
  })

  /*
   * GET BY ID OR SLUG TESTS
   */
  describe('getByIdOrSlug', () => {
    it('should resolve by UUID', () => {
      const created = projectsRepository.create(TEST_PROJECT)

      const project = projectsRepository.getByIdOrSlug(created.id)

      expect(project).not.toBeNull()
      expect(project?.id).toBe(created.id)
    })

    it('should resolve by slug', () => {
      const created = projectsRepository.create(TEST_PROJECT)

      const project = projectsRepository.getByIdOrSlug(created.slug)

      expect(project).not.toBeNull()
      expect(project?.id).toBe(created.id)
    })

    it('should return null for non-existent identifier', () => {
      const project = projectsRepository.getByIdOrSlug('no-such-project')

      expect(project).toBeNull()
    })
  })

  /*
   * LIST TESTS
   */
  describe('list', () => {
    beforeEach(() => {
      // Seed data for list tests
      projectsRepository.create({ ...TEST_PROJECT, name: 'Project 1' })
      projectsRepository.create({ ...TEST_PROJECT, name: 'Project 2' })
      projectsRepository.create(TEST_PROJECT_GITHUB)
    })

    it('should return all projects when no filters provided', () => {
      const projects = projectsRepository.list()

      // 3 created + seeded TEST_PROJECT_ID from test-utils
      expect(projects.length).toBeGreaterThanOrEqual(3)
    })

    it('should filter projects by owner_id', () => {
      const projects = projectsRepository.list({ owner_id: TEST_USER_ID })

      expect(projects.length).toBeGreaterThanOrEqual(3)
      expect(projects.every((p) => p.owner_id === TEST_USER_ID)).toBe(true)
    })

    it('should filter projects by repo_source', () => {
      const githubProjects = projectsRepository.list({ repo_source: 'github' })

      expect(githubProjects.length).toBeGreaterThanOrEqual(1)
      expect(githubProjects.every((p) => p.repo_source === 'github')).toBe(true)
    })

    it('should search projects by name', () => {
      const results = projectsRepository.list({ search: 'GitHub' })

      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.some((p) => p.name.includes('GitHub'))).toBe(true)
    })

    it('should search projects by description', () => {
      projectsRepository.create({
        ...TEST_PROJECT,
        name: 'Special Project',
        description: 'Contains the word searchable',
      })

      const results = projectsRepository.list({ search: 'searchable' })

      expect(results).toHaveLength(1)
      expect(results[0]?.name).toBe('Special Project')
    })

    it('should limit number of returned projects', () => {
      const projects = projectsRepository.list({ limit: 2 })

      expect(projects).toHaveLength(2)
    })

    it('should support pagination with offset', () => {
      const page1 = projectsRepository.list({ limit: 2, offset: 0 })
      const page2 = projectsRepository.list({ limit: 2, offset: 2 })

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
    it('should update project name', () => {
      const project = projectsRepository.create(TEST_PROJECT)

      const updated = projectsRepository.update(project.id, { name: 'Updated Name' })

      expect(updated?.name).toBe('Updated Name')
    })

    it('should return null when updating non-existent project', () => {
      const result = projectsRepository.update(NON_EXISTENT_ID, { name: 'New' })

      expect(result).toBeNull()
    })

    it('should support partial updates - only specified fields change', () => {
      const project = projectsRepository.create(TEST_PROJECT_FULL)

      const updated = projectsRepository.update(project.id, { name: 'New Name' })

      expect(updated?.name).toBe('New Name')
      expect(updated?.description, 'Description should remain unchanged').toBe(
        TEST_PROJECT_FULL.description
      )
      expect(updated?.local_path, 'local_path should remain unchanged').toBe(
        TEST_PROJECT_FULL.local_path
      )
    })

    it('should return existing project when update has no fields', () => {
      const project = projectsRepository.create(TEST_PROJECT)

      const result = projectsRepository.update(project.id, {})

      expect(result?.id).toBe(project.id)
      expect(result?.name).toBe(project.name)
    })

    it('should update slug', () => {
      const project = projectsRepository.create(TEST_PROJECT)

      const updated = projectsRepository.update(project.id, { slug: 'new-slug' })

      expect(updated?.slug).toBe('new-slug')
    })

    it('should update repo fields', () => {
      const project = projectsRepository.create(TEST_PROJECT)

      const updated = projectsRepository.update(project.id, {
        repo_source: 'gitlab',
        repo_owner: 'mygroup',
        repo_name: 'myrepo',
      })

      expect(updated?.repo_source).toBe('gitlab')
      expect(updated?.repo_owner).toBe('mygroup')
      expect(updated?.repo_name).toBe('myrepo')
    })
  })

  /*
   * DELETE TESTS
   */
  describe('delete', () => {
    it('should delete existing project and return true', () => {
      const project = projectsRepository.create(TEST_PROJECT)

      const deleted = projectsRepository.delete(project.id)

      expect(deleted, 'Delete should return true for existing project').toBe(true)
      expect(projectsRepository.get(project.id), 'Project should not exist after delete').toBeNull()
    })

    it('should return false when deleting non-existent project', () => {
      const deleted = projectsRepository.delete(NON_EXISTENT_ID)

      expect(deleted, 'Delete should return false for non-existent ID').toBe(false)
    })
  })
})
