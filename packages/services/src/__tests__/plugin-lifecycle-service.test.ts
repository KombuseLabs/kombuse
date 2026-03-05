import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  setupTestDb,
  TEST_PROJECT_ID,
  TEST_USER_ID,
} from '@kombuse/persistence/test-utils'
import {
  agentsRepository,
  agentTriggersRepository,
  labelsRepository,
  pluginsRepository,
  profilesRepository,
  getDatabase,
} from '@kombuse/persistence'
import type { KombusePluginManifest } from '@kombuse/types'
import {
  pluginLifecycleService,
  PluginNotFoundError,
} from '../plugin-lifecycle-service'
import { pluginImportService } from '../plugin-import-service'

// --- Helpers ---

let entityCounter = 0

function createTestPlugin(overrides?: {
  name?: string
  is_enabled?: boolean
}): string {
  const pluginId = crypto.randomUUID()
  pluginsRepository.create({
    id: pluginId,
    project_id: TEST_PROJECT_ID,
    name: overrides?.name ?? `test-plugin-${++entityCounter}`,
    version: '1.0.0',
    directory: '/tmp/test',
    manifest: JSON.stringify({
      name: overrides?.name ?? `test-plugin-${entityCounter}`,
      version: '1.0.0',
      kombuse: {
        plugin_system_version: 'kombuse-plugin-v1',
        exported_at: new Date().toISOString(),
        labels: [],
      },
    }),
    is_enabled: overrides?.is_enabled,
  })
  return pluginId
}

function createLinkedAgent(pluginId: string, slug?: string): string {
  const agentId = crypto.randomUUID()
  profilesRepository.create({
    id: agentId,
    type: 'agent',
    name: `Agent ${++entityCounter}`,
  })
  agentsRepository.create({
    id: agentId,
    name: `Agent ${entityCounter}`,
    description: `Test agent ${entityCounter}`,
    slug: slug ?? `agent-${entityCounter}-${Date.now()}`,
    system_prompt: 'Test prompt',
    plugin_id: pluginId,
  })
  return agentId
}

function createLinkedTrigger(
  agentId: string,
  pluginId: string
): number {
  const trigger = agentTriggersRepository.create({
    agent_id: agentId,
    event_type: 'ticket.created',
    project_id: TEST_PROJECT_ID,
    is_enabled: true,
    priority: 0,
    plugin_id: pluginId,
  })
  return trigger.id
}

function createLinkedLabel(pluginId: string): number {
  const label = labelsRepository.create({
    project_id: TEST_PROJECT_ID,
    name: `Label ${++entityCounter}`,
    color: '#00ff00',
    plugin_id: pluginId,
  })
  return label.id
}

function writePluginManifest(
  dir: string,
  pluginName: string,
  manifest?: Partial<KombusePluginManifest>
): void {
  const pluginDir = join(dir, pluginName, '.kombuse-plugin')
  mkdirSync(pluginDir, { recursive: true })
  writeFileSync(
    join(pluginDir, 'plugin.json'),
    JSON.stringify({
      name: pluginName,
      version: '1.0.0',
      kombuse: {
        plugin_system_version: 'kombuse-plugin-v1',
        exported_at: new Date().toISOString(),
        labels: [],
      },
      ...manifest,
    })
  )
  // Also write manifest.json for FilesystemFeed discovery
  writeFileSync(
    join(dir, pluginName, 'manifest.json'),
    JSON.stringify({
      name: pluginName,
      version: manifest?.version ?? '1.0.0',
      type: 'plugin',
      description: manifest?.description,
    })
  )
}

// --- Tests ---

describe('pluginLifecycleService', () => {
  let cleanup: () => void

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
  })

  afterEach(() => {
    cleanup()
  })

  describe('setPluginEnabled', () => {
    it('should enable plugin and cascade to agents, triggers, and labels', () => {
      const pluginId = createTestPlugin({ is_enabled: false })
      const agentId = createLinkedAgent(pluginId)
      const triggerId = createLinkedTrigger(agentId, pluginId)
      const labelId = createLinkedLabel(pluginId)

      // Manually disable agent, trigger, and label to simulate disabled state
      const db = getDatabase()
      db.prepare('UPDATE agents SET is_enabled = 0 WHERE id = ?').run(agentId)
      db.prepare('UPDATE agent_triggers SET is_enabled = 0 WHERE id = ?').run(triggerId)
      db.prepare('UPDATE labels SET is_enabled = 0 WHERE id = ?').run(labelId)

      const result = pluginLifecycleService.setPluginEnabled(pluginId, true)

      expect(result.is_enabled).toBe(true)

      const agent = agentsRepository.get(agentId)
      expect(agent!.is_enabled).toBe(true)

      const triggers = agentTriggersRepository.listByAgent(agentId)
      expect(triggers[0]!.is_enabled).toBe(true)

      const label = labelsRepository.get(labelId)
      expect(label!.is_enabled).toBe(1)
    })

    it('should disable plugin and cascade to agents and triggers', () => {
      const pluginId = createTestPlugin()
      const agentId = createLinkedAgent(pluginId)
      createLinkedTrigger(agentId, pluginId)

      const result = pluginLifecycleService.setPluginEnabled(pluginId, false)

      expect(result.is_enabled).toBe(false)

      const agent = agentsRepository.get(agentId)
      expect(agent!.is_enabled).toBe(false)

      const triggers = agentTriggersRepository.listByAgent(agentId)
      expect(triggers[0]!.is_enabled).toBe(false)
    })

    it('should not affect agents from other plugins', () => {
      const pluginA = createTestPlugin({ name: 'plugin-a' })
      const pluginB = createTestPlugin({ name: 'plugin-b' })

      const agentA = createLinkedAgent(pluginA, 'agent-a')
      const agentB = createLinkedAgent(pluginB, 'agent-b')

      pluginLifecycleService.setPluginEnabled(pluginA, false)

      expect(agentsRepository.get(agentA)!.is_enabled).toBe(false)
      expect(agentsRepository.get(agentB)!.is_enabled).toBe(true)
    })

    it('should cascade disable to labels', () => {
      const pluginId = createTestPlugin()
      const labelId = createLinkedLabel(pluginId)

      pluginLifecycleService.setPluginEnabled(pluginId, false)

      const label = labelsRepository.get(labelId)
      expect(label).not.toBeNull()
      expect(label!.is_enabled).toBe(0)
    })

    it('should not affect labels from other plugins', () => {
      const pluginA = createTestPlugin({ name: 'plugin-label-a' })
      const pluginB = createTestPlugin({ name: 'plugin-label-b' })

      const labelA = createLinkedLabel(pluginA)
      const labelB = createLinkedLabel(pluginB)

      pluginLifecycleService.setPluginEnabled(pluginA, false)

      expect(labelsRepository.get(labelA)!.is_enabled).toBe(0)
      expect(labelsRepository.get(labelB)!.is_enabled).toBe(1)
    })

    it('should throw PluginNotFoundError for non-existent plugin', () => {
      expect(() =>
        pluginLifecycleService.setPluginEnabled('non-existent-id', true)
      ).toThrow(PluginNotFoundError)

      expect(() =>
        pluginLifecycleService.setPluginEnabled('non-existent-id', false)
      ).toThrow(PluginNotFoundError)
    })
  })

  describe('uninstallPlugin — orphan mode', () => {
    it('should null out plugin_id on all entities and delete plugin row', () => {
      const pluginId = createTestPlugin()
      const agentId = createLinkedAgent(pluginId)
      createLinkedTrigger(agentId, pluginId)
      const labelId = createLinkedLabel(pluginId)

      pluginLifecycleService.uninstallPlugin(pluginId, 'orphan')

      // Plugin row should be deleted
      expect(pluginsRepository.get(pluginId)).toBeNull()

      // Entities should still exist but with plugin_id = null
      const agent = agentsRepository.get(agentId)
      expect(agent).not.toBeNull()
      expect(agent!.plugin_id).toBeNull()

      const triggers = agentTriggersRepository.listByAgent(agentId)
      expect(triggers).toHaveLength(1)
      expect(triggers[0]!.plugin_id).toBeNull()

      const label = labelsRepository.get(labelId)
      expect(label).not.toBeNull()
      expect(label!.plugin_id).toBeNull()
    })
  })

  describe('uninstallPlugin — delete mode', () => {
    it('should delete all plugin entities and the plugin row', () => {
      const pluginId = createTestPlugin()
      const agentId = createLinkedAgent(pluginId)
      createLinkedTrigger(agentId, pluginId)
      const labelId = createLinkedLabel(pluginId)

      pluginLifecycleService.uninstallPlugin(pluginId, 'delete')

      // Plugin row deleted
      expect(pluginsRepository.get(pluginId)).toBeNull()

      // Agent deleted
      expect(agentsRepository.get(agentId)).toBeNull()

      // Profile soft-deleted (is_active = false)
      const profile = profilesRepository.get(agentId)
      expect(profile).not.toBeNull()
      expect(profile!.is_active).toBe(false)

      // Label orphaned (not deleted) — preserves ticket-label associations
      const label = labelsRepository.get(labelId)
      expect(label).not.toBeNull()
      expect(label!.plugin_id).toBeNull()

      // Triggers cascade-deleted with agent
      const triggers = agentTriggersRepository.listByAgent(agentId)
      expect(triggers).toHaveLength(0)
    })

    it('should preserve ticket-label associations when deleting plugin', () => {
      const pluginId = createTestPlugin()
      const labelId = createLinkedLabel(pluginId)

      // Create a ticket and apply the label
      const db = getDatabase()
      db.prepare(
        "INSERT INTO tickets (project_id, title, author_id) VALUES (?, 'Test', ?)"
      ).run(TEST_PROJECT_ID, TEST_USER_ID)
      const ticket = db
        .prepare('SELECT id FROM tickets WHERE project_id = ? ORDER BY id DESC LIMIT 1')
        .get(TEST_PROJECT_ID) as { id: number }
      labelsRepository.addToTicket(ticket.id, labelId)

      pluginLifecycleService.uninstallPlugin(pluginId, 'delete')

      // Label should be orphaned with ticket association intact
      const label = labelsRepository.get(labelId)
      expect(label).not.toBeNull()
      expect(label!.plugin_id).toBeNull()

      const ticketLabels = labelsRepository.getTicketLabels(ticket.id)
      expect(ticketLabels).toHaveLength(1)
      expect(ticketLabels[0]!.id).toBe(labelId)
    })
  })

  describe('uninstallPlugin — delete then reinstall', () => {
    it('should reuse the same profile ID after uninstall and reinstall', () => {
      // Create a plugin package on disk for the import service
      const tempDir = mkdtempSync(join(tmpdir(), 'lifecycle-reinstall-'))
      const agentSlug = `reinstall-agent-${Date.now()}`
      const pluginDir = join(tempDir, '.kombuse-plugin')
      mkdirSync(pluginDir, { recursive: true })
      writeFileSync(
        join(pluginDir, 'plugin.json'),
        JSON.stringify({
          name: 'reinstall-test-plugin',
          version: '1.0.0',
          kombuse: {
            plugin_system_version: 'kombuse-plugin-v1',
            exported_at: new Date().toISOString(),
            labels: [],
          },
        })
      )
      const agentsDir = join(tempDir, 'agents')
      mkdirSync(agentsDir, { recursive: true })
      writeFileSync(
        join(agentsDir, `${agentSlug}.md`),
        `---\nname: "Reinstall Agent"\nslug: "${agentSlug}"\ntype: "kombuse"\nis_enabled: true\nenabled_for_chat: false\npermissions: []\ntriggers: []\n---\n\nTest prompt`
      )

      // Install
      const first = pluginImportService.installPackage({
        package_path: tempDir,
        project_id: TEST_PROJECT_ID,
      })
      expect(first.agents_created).toBe(1)
      const originalProfile = profilesRepository.getBySlug(agentSlug)
      expect(originalProfile).not.toBeNull()
      const originalId = originalProfile!.id

      // Uninstall with delete mode
      pluginLifecycleService.uninstallPlugin(first.plugin_id, 'delete')

      // Profile should be soft-deleted
      const deletedProfile = profilesRepository.getBySlug(agentSlug)
      expect(deletedProfile).not.toBeNull()
      expect(deletedProfile!.is_active).toBe(false)

      // Reinstall
      const second = pluginImportService.installPackage({
        package_path: tempDir,
        project_id: TEST_PROJECT_ID,
      })
      expect(second.agents_created).toBe(1)

      // Profile should be reactivated with the same ID
      const reinstalledProfile = profilesRepository.getBySlug(agentSlug)
      expect(reinstalledProfile).not.toBeNull()
      expect(reinstalledProfile!.id, 'Profile ID should be reused').toBe(originalId)
      expect(reinstalledProfile!.is_active, 'Profile should be active after reinstall').toBe(true)

      // No orphaned profiles — count profiles with this slug
      const db = getDatabase()
      const count = db
        .prepare('SELECT COUNT(*) as cnt FROM profiles WHERE slug = ?')
        .get(agentSlug) as { cnt: number }
      expect(count.cnt, 'Should have exactly one profile for this slug').toBe(1)

      // Clean up temp dir
      rmSync(tempDir, { recursive: true })
    })
  })

  describe('uninstallPlugin — errors', () => {
    it('should throw PluginNotFoundError for non-existent plugin', () => {
      expect(() =>
        pluginLifecycleService.uninstallPlugin('non-existent-id', 'orphan')
      ).toThrow(PluginNotFoundError)
    })
  })

  describe('getAvailablePlugins', () => {
    let tempDir: string
    let originalHome: string | undefined

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'lifecycle-test-'))
      originalHome = process.env.HOME
    })

    afterEach(() => {
      process.env.HOME = originalHome
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true })
    })

    it('should find plugins in project directory', async () => {
      process.env.HOME = join(tempDir, 'empty-home') // Isolate from real ~/.kombuse/plugins/
      const db = getDatabase()
      db.prepare('UPDATE projects SET local_path = ? WHERE id = ?').run(
        tempDir,
        TEST_PROJECT_ID
      )

      const pluginsDir = join(tempDir, '.kombuse', 'plugins')
      writePluginManifest(pluginsDir, 'project-plugin')

      const available = await pluginLifecycleService.getAvailablePlugins(TEST_PROJECT_ID)
      const fsPlugins = available.filter((p) => p.source === 'filesystem')

      expect(fsPlugins).toHaveLength(1)
      expect(fsPlugins[0]!.name).toBe('project-plugin')
      expect(fsPlugins[0]!.source).toBe('filesystem')
      expect(fsPlugins[0]!.installed).toBe(false)
    })

    it('should find plugins in global directory', async () => {
      // Point HOME to tempDir so getKombuseDir() returns tempDir/.kombuse
      process.env.HOME = tempDir
      const globalPluginsDir = join(tempDir, '.kombuse', 'plugins')
      writePluginManifest(globalPluginsDir, 'global-plugin')

      const available = await pluginLifecycleService.getAvailablePlugins(TEST_PROJECT_ID)
      const globalPlugin = available.find((p) => p.name === 'global-plugin')
      expect(globalPlugin).toBeDefined()
      expect(globalPlugin!.source).toBe('filesystem')
    })

    it('should mark installed plugins', async () => {
      process.env.HOME = join(tempDir, 'empty-home') // Isolate from real ~/.kombuse/plugins/
      const db = getDatabase()
      db.prepare('UPDATE projects SET local_path = ? WHERE id = ?').run(
        tempDir,
        TEST_PROJECT_ID
      )

      const pluginsDir = join(tempDir, '.kombuse', 'plugins')
      writePluginManifest(pluginsDir, 'installed-plugin')

      // Install the plugin in DB
      pluginsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'installed-plugin',
        version: '1.0.0',
        directory: join(pluginsDir, 'installed-plugin'),
        manifest: JSON.stringify({
          name: 'installed-plugin',
          version: '1.0.0',
          kombuse: {
            plugin_system_version: 'kombuse-plugin-v1',
            exported_at: new Date().toISOString(),
            labels: [],
          },
        }),
      })

      const available = await pluginLifecycleService.getAvailablePlugins(TEST_PROJECT_ID)
      const plugin = available.find((p) => p.name === 'installed-plugin')
      expect(plugin).toBeDefined()
      expect(plugin!.installed).toBe(true)
    })

    it('should skip directories with invalid manifests', async () => {
      process.env.HOME = join(tempDir, 'empty-home') // Isolate from real ~/.kombuse/plugins/
      const db = getDatabase()
      db.prepare('UPDATE projects SET local_path = ? WHERE id = ?').run(
        tempDir,
        TEST_PROJECT_ID
      )

      const pluginsDir = join(tempDir, '.kombuse', 'plugins')

      // Valid plugin (has both manifest.json and .kombuse-plugin/plugin.json)
      writePluginManifest(pluginsDir, 'valid-plugin')

      // Invalid plugin — no manifest.json at root
      mkdirSync(join(pluginsDir, 'no-manifest'), { recursive: true })

      // Invalid plugin — bad JSON in manifest.json
      mkdirSync(join(pluginsDir, 'bad-json'), { recursive: true })
      writeFileSync(join(pluginsDir, 'bad-json', 'manifest.json'), 'not json')

      // Invalid plugin — missing required fields in manifest.json
      mkdirSync(join(pluginsDir, 'incomplete'), { recursive: true })
      writeFileSync(join(pluginsDir, 'incomplete', 'manifest.json'), JSON.stringify({ version: '1.0.0' }))

      const available = await pluginLifecycleService.getAvailablePlugins(TEST_PROJECT_ID)
      const fsPlugins = available.filter((p) => p.source === 'filesystem')
      expect(fsPlugins).toHaveLength(1)
      expect(fsPlugins[0]!.name).toBe('valid-plugin')
    })

    it('should give project plugins precedence over global duplicates', async () => {
      // Use separate dirs for project local_path and HOME
      const projectBase = mkdtempSync(join(tmpdir(), 'lifecycle-proj-'))
      const globalBase = mkdtempSync(join(tmpdir(), 'lifecycle-global-'))

      const db = getDatabase()
      db.prepare('UPDATE projects SET local_path = ? WHERE id = ?').run(
        projectBase,
        TEST_PROJECT_ID
      )

      // Create same plugin in project's .kombuse/plugins/
      const projectPluginsDir = join(projectBase, '.kombuse', 'plugins')
      writePluginManifest(projectPluginsDir, 'shared-plugin', {
        description: 'project version',
      })

      // Create same plugin in global ~/.kombuse/plugins/
      process.env.HOME = globalBase
      const globalPluginsDir = join(globalBase, '.kombuse', 'plugins')
      writePluginManifest(globalPluginsDir, 'shared-plugin', {
        description: 'global version',
      })

      const available = await pluginLifecycleService.getAvailablePlugins(TEST_PROJECT_ID)
      const sharedPlugins = available.filter((p) => p.name === 'shared-plugin')
      expect(sharedPlugins).toHaveLength(1)
      // Project feed is listed first, so project plugin wins dedup
      expect(sharedPlugins[0]!.description).toBe('project version')

      // Cleanup extra dirs
      rmSync(projectBase, { recursive: true })
      rmSync(globalBase, { recursive: true })
    })

    it('should match installed plugins when feed returns compound name', async () => {
      // Simulate an HTTP feed returning compound name (e.g. "kombuse/my-plugin")
      // while installed plugin uses simple name ("my-plugin")
      pluginsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'my-plugin',
        version: '1.0.0',
        directory: '/tmp/test',
        manifest: JSON.stringify({
          name: 'my-plugin',
          version: '1.0.0',
          author: 'kombuse',
          kombuse: {
            plugin_system_version: 'kombuse-plugin-v1',
            exported_at: new Date().toISOString(),
            labels: [],
          },
        }),
      })

      const feedBuilder = await import('../plugin-feed-builder')
      const spy = vi.spyOn(feedBuilder, 'buildPluginPackageManager').mockReturnValue({
        search: vi.fn().mockResolvedValue([
          {
            name: 'kombuse/my-plugin', // compound name from HTTP feed
            version: '1.0.0',
            manifest: { name: 'my-plugin', version: '1.0.0', type: 'plugin', author: 'kombuse' },
            feedId: 'http:https://registry.example.com',
          },
        ]),
      } as any)

      const available = await pluginLifecycleService.getAvailablePlugins(TEST_PROJECT_ID)
      const plugin = available.find((p) => p.name === 'kombuse/my-plugin')

      expect(plugin).toBeDefined()
      expect(plugin!.installed).toBe(true)
      expect(plugin!.installed_version).toBe('1.0.0')

      spy.mockRestore()
    })

    it('should detect updates for installed plugins with compound feed names', async () => {
      pluginsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'my-plugin',
        version: '1.0.0',
        directory: '/tmp/test',
        manifest: JSON.stringify({
          name: 'my-plugin',
          version: '1.0.0',
          author: 'kombuse',
          kombuse: {
            plugin_system_version: 'kombuse-plugin-v1',
            exported_at: new Date().toISOString(),
            labels: [],
          },
        }),
      })

      const feedBuilder = await import('../plugin-feed-builder')
      const spy = vi.spyOn(feedBuilder, 'buildPluginPackageManager').mockReturnValue({
        search: vi.fn().mockResolvedValue([
          {
            name: 'kombuse/my-plugin',
            version: '2.0.0', // newer version available
            manifest: { name: 'my-plugin', version: '2.0.0', type: 'plugin', author: 'kombuse' },
            feedId: 'http:https://registry.example.com',
          },
        ]),
      } as any)

      const available = await pluginLifecycleService.getAvailablePlugins(TEST_PROJECT_ID)
      const plugin = available.find((p) => p.name === 'kombuse/my-plugin')

      expect(plugin).toBeDefined()
      expect(plugin!.installed).toBe(true)
      expect(plugin!.has_update).toBe(true)
      expect(plugin!.installed_version).toBe('1.0.0')
      expect(plugin!.latest_version).toBe('2.0.0')

      spy.mockRestore()
    })
  })

  describe('checkForUpdates', () => {
    let tempDir: string
    let originalHome: string | undefined

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'lifecycle-update-'))
      originalHome = process.env.HOME
    })

    afterEach(() => {
      process.env.HOME = originalHome
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true })
    })

    it('should detect update when feed version is newer', async () => {
      const db = getDatabase()
      db.prepare('UPDATE projects SET local_path = ? WHERE id = ?').run(
        tempDir,
        TEST_PROJECT_ID
      )

      const pluginsDir = join(tempDir, '.kombuse', 'plugins')
      writePluginManifest(pluginsDir, 'updatable-plugin', { version: '2.0.0' })

      const pluginId = crypto.randomUUID()
      pluginsRepository.create({
        id: pluginId,
        project_id: TEST_PROJECT_ID,
        name: 'updatable-plugin',
        version: '1.0.0',
        directory: join(pluginsDir, 'updatable-plugin'),
        manifest: JSON.stringify({
          name: 'updatable-plugin',
          version: '1.0.0',
          kombuse: {
            plugin_system_version: 'kombuse-plugin-v1',
            exported_at: new Date().toISOString(),
            labels: [],
          },
        }),
      })

      const result = await pluginLifecycleService.checkForUpdates(pluginId)

      expect(result.has_update).toBe(true)
      expect(result.current_version).toBe('1.0.0')
      expect(result.latest_version).toBe('2.0.0')
      expect(result.plugin_name).toBe('updatable-plugin')
    })

    it('should report no update when versions match', async () => {
      const db = getDatabase()
      db.prepare('UPDATE projects SET local_path = ? WHERE id = ?').run(
        tempDir,
        TEST_PROJECT_ID
      )

      const pluginsDir = join(tempDir, '.kombuse', 'plugins')
      writePluginManifest(pluginsDir, 'current-plugin')

      const pluginId = crypto.randomUUID()
      pluginsRepository.create({
        id: pluginId,
        project_id: TEST_PROJECT_ID,
        name: 'current-plugin',
        version: '1.0.0',
        directory: join(pluginsDir, 'current-plugin'),
        manifest: JSON.stringify({
          name: 'current-plugin',
          version: '1.0.0',
          kombuse: {
            plugin_system_version: 'kombuse-plugin-v1',
            exported_at: new Date().toISOString(),
            labels: [],
          },
        }),
      })

      const result = await pluginLifecycleService.checkForUpdates(pluginId)

      expect(result.has_update).toBe(false)
      expect(result.current_version).toBe('1.0.0')
    })

    it('should throw PluginNotFoundError for non-existent plugin', async () => {
      await expect(
        pluginLifecycleService.checkForUpdates('non-existent-id')
      ).rejects.toThrow(PluginNotFoundError)
    })
  })
})
