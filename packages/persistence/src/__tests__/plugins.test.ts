import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { DatabaseType } from '../database'
import { setupTestDb, TEST_PROJECT_ID } from '../test-utils'
import { pluginsRepository } from '../plugins.repository'
import { agentsRepository } from '../agents.repository'
import { labelsRepository } from '../labels.repository'
import { profilesRepository } from '../profiles.repository'

const SAMPLE_MANIFEST = JSON.stringify({
  name: 'test-plugin',
  version: '1.0.0',
  description: 'A test plugin',
  kombuse: {
    plugin_system_version: 'kombuse-plugin-v1',
    project_id: TEST_PROJECT_ID,
    exported_at: '2026-01-01T00:00:00.000Z',
    labels: [{ name: 'Bug', color: '#ff0000', description: null }],
  },
})

function pluginInput(overrides: Partial<Parameters<typeof pluginsRepository.create>[0]> = {}) {
  return {
    project_id: TEST_PROJECT_ID,
    name: 'test-plugin',
    version: '1.0.0',
    description: 'A test plugin',
    directory: '/tmp/test-plugin',
    manifest: SAMPLE_MANIFEST,
    ...overrides,
  }
}

describe('pluginsRepository', () => {
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

  describe('create', () => {
    it('should create a plugin with auto-generated id', () => {
      const plugin = pluginsRepository.create(pluginInput())

      expect(plugin.id).toBeTruthy()
      expect(plugin.project_id).toBe(TEST_PROJECT_ID)
      expect(plugin.name).toBe('test-plugin')
      expect(plugin.version).toBe('1.0.0')
      expect(plugin.description).toBe('A test plugin')
      expect(plugin.directory).toBe('/tmp/test-plugin')
      expect(plugin.manifest.name).toBe('test-plugin')
      expect(plugin.is_enabled).toBe(true)
      expect(plugin.installed_at).toBeTruthy()
      expect(plugin.updated_at).toBeTruthy()
    })

    it('should create a plugin with provided id', () => {
      const plugin = pluginsRepository.create(pluginInput({ id: 'custom-id' }))
      expect(plugin.id).toBe('custom-id')
    })

    it('should default version to 1.0.0', () => {
      const plugin = pluginsRepository.create(pluginInput({ version: undefined }))
      expect(plugin.version).toBe('1.0.0')
    })

    it('should enforce unique (project_id, name) constraint', () => {
      pluginsRepository.create(pluginInput())
      expect(() => pluginsRepository.create(pluginInput())).toThrow()
    })

    it('should allow same name in different projects', () => {
      // Create a second project
      db.prepare(
        "INSERT INTO projects (id, name, owner_id) VALUES ('project-2', 'Project 2', 'test-user-1')"
      ).run()

      pluginsRepository.create(pluginInput())
      const plugin2 = pluginsRepository.create(
        pluginInput({ project_id: 'project-2' })
      )
      expect(plugin2.project_id).toBe('project-2')
    })
  })

  describe('get', () => {
    it('should return a plugin by id', () => {
      const created = pluginsRepository.create(pluginInput({ id: 'get-test' }))
      const fetched = pluginsRepository.get('get-test')

      expect(fetched).not.toBeNull()
      expect(fetched!.id).toBe(created.id)
      expect(fetched!.manifest.kombuse.plugin_system_version).toBe('kombuse-plugin-v1')
    })

    it('should return null for nonexistent id', () => {
      expect(pluginsRepository.get('nonexistent')).toBeNull()
    })
  })

  describe('getByName', () => {
    it('should return a plugin by project_id and name', () => {
      pluginsRepository.create(pluginInput())
      const found = pluginsRepository.getByName(TEST_PROJECT_ID, 'test-plugin')

      expect(found).not.toBeNull()
      expect(found!.name).toBe('test-plugin')
    })

    it('should return null for wrong project', () => {
      pluginsRepository.create(pluginInput())
      expect(pluginsRepository.getByName('wrong-project', 'test-plugin')).toBeNull()
    })

    it('should return null for wrong name', () => {
      pluginsRepository.create(pluginInput())
      expect(pluginsRepository.getByName(TEST_PROJECT_ID, 'wrong-name')).toBeNull()
    })
  })

  describe('list', () => {
    it('should return all plugins when no filters', () => {
      pluginsRepository.create(pluginInput({ name: 'plugin-a' }))
      pluginsRepository.create(pluginInput({ name: 'plugin-b' }))

      const plugins = pluginsRepository.list()
      expect(plugins).toHaveLength(2)
    })

    it('should filter by project_id', () => {
      db.prepare(
        "INSERT INTO projects (id, name, owner_id) VALUES ('project-2', 'Project 2', 'test-user-1')"
      ).run()

      pluginsRepository.create(pluginInput({ name: 'plugin-a' }))
      pluginsRepository.create(
        pluginInput({ name: 'plugin-b', project_id: 'project-2' })
      )

      const plugins = pluginsRepository.list({ project_id: TEST_PROJECT_ID })
      expect(plugins).toHaveLength(1)
      expect(plugins[0]!.name).toBe('plugin-a')
    })

    it('should filter by is_enabled', () => {
      pluginsRepository.create(pluginInput({ name: 'enabled' }))
      pluginsRepository.create(
        pluginInput({ name: 'disabled', is_enabled: false })
      )

      const enabled = pluginsRepository.list({ is_enabled: true })
      expect(enabled).toHaveLength(1)
      expect(enabled[0]!.name).toBe('enabled')

      const disabled = pluginsRepository.list({ is_enabled: false })
      expect(disabled).toHaveLength(1)
      expect(disabled[0]!.name).toBe('disabled')
    })
  })

  describe('update', () => {
    it('should update is_enabled', () => {
      const plugin = pluginsRepository.create(pluginInput())
      const updated = pluginsRepository.update(plugin.id, { is_enabled: false })

      expect(updated).not.toBeNull()
      expect(updated!.is_enabled).toBe(false)
    })

    it('should update version', () => {
      const plugin = pluginsRepository.create(pluginInput())
      const updated = pluginsRepository.update(plugin.id, { version: '2.0.0' })

      expect(updated!.version).toBe('2.0.0')
    })

    it('should return current plugin when no fields provided', () => {
      const plugin = pluginsRepository.create(pluginInput())
      const same = pluginsRepository.update(plugin.id, {})

      expect(same!.id).toBe(plugin.id)
    })

    it('should return null for nonexistent id', () => {
      expect(pluginsRepository.update('nonexistent', { is_enabled: false })).toBeNull()
    })
  })

  describe('delete', () => {
    it('should delete a plugin', () => {
      const plugin = pluginsRepository.create(pluginInput())
      expect(pluginsRepository.delete(plugin.id)).toBe(true)
      expect(pluginsRepository.get(plugin.id)).toBeNull()
    })

    it('should return false for nonexistent id', () => {
      expect(pluginsRepository.delete('nonexistent')).toBe(false)
    })
  })

  describe('cascade and FK behavior', () => {
    it('should cascade delete when project is deleted', () => {
      const plugin = pluginsRepository.create(pluginInput())
      db.prepare('DELETE FROM projects WHERE id = ?').run(TEST_PROJECT_ID)
      expect(pluginsRepository.get(plugin.id)).toBeNull()
    })

    it('should set plugin_id to NULL on agents when plugin is deleted', () => {
      const plugin = pluginsRepository.create(pluginInput())

      // Create an agent linked to the plugin
      const agentId = `agent-plugin-test-${Date.now()}`
      profilesRepository.create({
        id: agentId,
        type: 'agent',
        name: 'Plugin Agent',
        description: 'Test',
      })
      agentsRepository.create({
        id: agentId,
        name: 'Plugin Agent',
        description: 'Test',
        system_prompt: 'test',
        plugin_id: plugin.id,
      })

      const agentBefore = agentsRepository.get(agentId)
      expect(agentBefore!.plugin_id).toBe(plugin.id)

      pluginsRepository.delete(plugin.id)

      const agentAfter = agentsRepository.get(agentId)
      expect(agentAfter).not.toBeNull()
      expect(agentAfter!.plugin_id).toBeNull()
    })

    it('should set plugin_id to NULL on labels when plugin is deleted', () => {
      const plugin = pluginsRepository.create(pluginInput())

      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'Plugin Label',
        plugin_id: plugin.id,
      })

      expect(label.plugin_id).toBe(plugin.id)

      pluginsRepository.delete(plugin.id)

      const labelAfter = labelsRepository.get(label.id)
      expect(labelAfter).not.toBeNull()
      expect(labelAfter!.plugin_id).toBeNull()
    })
  })
})
