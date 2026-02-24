import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { DatabaseType } from '../database'
import { setupTestDb, TEST_PROJECT_ID } from '../test-utils'
import { pluginsRepository } from '../plugins.repository'
import { pluginFilesRepository } from '../plugin-files.repository'

const SAMPLE_MANIFEST = JSON.stringify({
  name: 'test-plugin',
  version: '1.0.0',
  kombuse: {
    plugin_system_version: 'kombuse-plugin-v1',
    project_id: TEST_PROJECT_ID,
    exported_at: '2026-01-01T00:00:00.000Z',
    labels: [],
  },
})

function createTestPlugin(_db: DatabaseType, name = 'test-plugin') {
  return pluginsRepository.create({
    project_id: TEST_PROJECT_ID,
    name,
    directory: `/tmp/${name}`,
    manifest: SAMPLE_MANIFEST,
  })
}

describe('pluginFilesRepository', () => {
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
    it('should create a new plugin file', () => {
      const plugin = createTestPlugin(db)
      const file = pluginFilesRepository.upsert({
        plugin_id: plugin.id,
        path: 'preamble/shared.md',
        content: '# Shared Preamble',
      })

      expect(file.id).toBeTruthy()
      expect(file.plugin_id).toBe(plugin.id)
      expect(file.path).toBe('preamble/shared.md')
      expect(file.content).toBe('# Shared Preamble')
      expect(file.content_hash).toBeTruthy()
      expect(file.is_user_modified).toBe(false)
    })

    it('should update an existing file when not user-modified', () => {
      const plugin = createTestPlugin(db)
      pluginFilesRepository.upsert({
        plugin_id: plugin.id,
        path: 'preamble/shared.md',
        content: 'original',
      })

      const updated = pluginFilesRepository.upsert({
        plugin_id: plugin.id,
        path: 'preamble/shared.md',
        content: 'updated',
      })

      expect(updated.content).toBe('updated')
    })

    it('should not overwrite user-modified files', () => {
      const plugin = createTestPlugin(db)
      const file = pluginFilesRepository.upsert({
        plugin_id: plugin.id,
        path: 'preamble/shared.md',
        content: 'original',
      })

      // Mark as user-modified
      pluginFilesRepository.update(file.id, {
        content: 'user version',
        is_user_modified: true,
      })

      // Upsert should NOT overwrite
      const result = pluginFilesRepository.upsert({
        plugin_id: plugin.id,
        path: 'preamble/shared.md',
        content: 'plugin update',
      })

      expect(result.content).toBe('user version')
      expect(result.is_user_modified).toBe(true)
    })

    it('should compute a consistent content hash', () => {
      const plugin = createTestPlugin(db)
      const file1 = pluginFilesRepository.upsert({
        plugin_id: plugin.id,
        path: 'a.md',
        content: 'hello',
      })

      // Same content = same hash
      const plugin2 = createTestPlugin(db, 'test-plugin-2')
      const file2 = pluginFilesRepository.upsert({
        plugin_id: plugin2.id,
        path: 'b.md',
        content: 'hello',
      })

      expect(file1.content_hash).toBe(file2.content_hash)
    })
  })

  describe('list', () => {
    it('should list all files for a plugin', () => {
      const plugin = createTestPlugin(db)
      pluginFilesRepository.upsert({
        plugin_id: plugin.id,
        path: 'preamble/shared.md',
        content: 'shared',
      })
      pluginFilesRepository.upsert({
        plugin_id: plugin.id,
        path: 'preamble/coder-rules.md',
        content: 'coder',
      })

      const files = pluginFilesRepository.list(plugin.id)
      expect(files).toHaveLength(2)
      // Ordered by path
      expect(files[0]!.path).toBe('preamble/coder-rules.md')
      expect(files[1]!.path).toBe('preamble/shared.md')
    })

    it('should not return files from other plugins', () => {
      const plugin1 = createTestPlugin(db, 'plugin-1')
      const plugin2 = createTestPlugin(db, 'plugin-2')

      pluginFilesRepository.upsert({
        plugin_id: plugin1.id,
        path: 'a.md',
        content: 'from plugin 1',
      })
      pluginFilesRepository.upsert({
        plugin_id: plugin2.id,
        path: 'b.md',
        content: 'from plugin 2',
      })

      const files = pluginFilesRepository.list(plugin1.id)
      expect(files).toHaveLength(1)
      expect(files[0]!.content).toBe('from plugin 1')
    })
  })

  describe('get', () => {
    it('should return a file by plugin_id and path', () => {
      const plugin = createTestPlugin(db)
      pluginFilesRepository.upsert({
        plugin_id: plugin.id,
        path: 'preamble/shared.md',
        content: 'hello',
      })

      const file = pluginFilesRepository.get(plugin.id, 'preamble/shared.md')
      expect(file).not.toBeNull()
      expect(file!.content).toBe('hello')
    })

    it('should return null for nonexistent path', () => {
      const plugin = createTestPlugin(db)
      expect(pluginFilesRepository.get(plugin.id, 'nonexistent')).toBeNull()
    })
  })

  describe('getById', () => {
    it('should return a file by id', () => {
      const plugin = createTestPlugin(db)
      const created = pluginFilesRepository.upsert({
        plugin_id: plugin.id,
        path: 'test.md',
        content: 'content',
      })

      const fetched = pluginFilesRepository.getById(created.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.path).toBe('test.md')
    })

    it('should return null for nonexistent id', () => {
      expect(pluginFilesRepository.getById(999999)).toBeNull()
    })
  })

  describe('update', () => {
    it('should update content and mark as user-modified', () => {
      const plugin = createTestPlugin(db)
      const file = pluginFilesRepository.upsert({
        plugin_id: plugin.id,
        path: 'test.md',
        content: 'original',
      })

      const updated = pluginFilesRepository.update(file.id, {
        content: 'modified',
      })

      expect(updated).not.toBeNull()
      expect(updated!.content).toBe('modified')
      expect(updated!.is_user_modified).toBe(true)
    })

    it('should update is_user_modified explicitly', () => {
      const plugin = createTestPlugin(db)
      const file = pluginFilesRepository.upsert({
        plugin_id: plugin.id,
        path: 'test.md',
        content: 'content',
      })

      pluginFilesRepository.update(file.id, {
        content: 'modified',
        is_user_modified: false,
      })

      const result = pluginFilesRepository.getById(file.id)
      expect(result!.is_user_modified).toBe(false)
    })

    it('should return null for nonexistent id', () => {
      expect(pluginFilesRepository.update(999999, { content: 'x' })).toBeNull()
    })
  })

  describe('delete', () => {
    it('should delete a file', () => {
      const plugin = createTestPlugin(db)
      const file = pluginFilesRepository.upsert({
        plugin_id: plugin.id,
        path: 'test.md',
        content: 'content',
      })

      expect(pluginFilesRepository.delete(file.id)).toBe(true)
      expect(pluginFilesRepository.getById(file.id)).toBeNull()
    })

    it('should return false for nonexistent id', () => {
      expect(pluginFilesRepository.delete(999999)).toBe(false)
    })
  })

  describe('deleteByPlugin', () => {
    it('should delete all files for a plugin', () => {
      const plugin = createTestPlugin(db)
      pluginFilesRepository.upsert({
        plugin_id: plugin.id,
        path: 'a.md',
        content: 'a',
      })
      pluginFilesRepository.upsert({
        plugin_id: plugin.id,
        path: 'b.md',
        content: 'b',
      })

      const count = pluginFilesRepository.deleteByPlugin(plugin.id)
      expect(count).toBe(2)
      expect(pluginFilesRepository.list(plugin.id)).toHaveLength(0)
    })
  })

  describe('cascade behavior', () => {
    it('should cascade delete when plugin is deleted', () => {
      const plugin = createTestPlugin(db)
      const file = pluginFilesRepository.upsert({
        plugin_id: plugin.id,
        path: 'test.md',
        content: 'content',
      })

      pluginsRepository.delete(plugin.id)
      expect(pluginFilesRepository.getById(file.id)).toBeNull()
    })
  })
})
