import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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
import { SELF_PLACEHOLDER } from '@kombuse/types'
import type { KombusePluginManifest } from '@kombuse/types'
import {
  pluginImportService,
  PluginAlreadyInstalledError,
  InvalidManifestError,
} from '../plugin-import-service'
import { pluginLifecycleService } from '../plugin-lifecycle-service'

// --- Helpers ---

function createManifest(
  overrides?: Partial<KombusePluginManifest>
): KombusePluginManifest {
  return {
    name: 'test-plugin',
    version: '1.0.0',
    kombuse: {
      plugin_system_version: 'kombuse-plugin-v1',
      project_id: TEST_PROJECT_ID,
      exported_at: new Date().toISOString(),
      labels: [],
    },
    ...overrides,
  }
}

function writeManifest(dir: string, manifest: KombusePluginManifest): void {
  const metaDir = join(dir, '.claude-plugin')
  mkdirSync(metaDir, { recursive: true })
  writeFileSync(join(metaDir, 'plugin.json'), JSON.stringify(manifest))
}

function writeAgentFile(
  packageDir: string,
  filename: string,
  frontmatter: Record<string, unknown>,
  body: string
): void {
  const agentsDir = join(packageDir, 'agents')
  mkdirSync(agentsDir, { recursive: true })

  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        const items = v
          .map((item) => {
            if (typeof item === 'object' && item !== null) {
              const inner = Object.entries(item)
                .map(([ik, iv]) => `    ${ik}: ${JSON.stringify(iv)}`)
                .join('\n')
              return `  -\n${inner}`
            }
            return `  - ${JSON.stringify(item)}`
          })
          .join('\n')
        return `${k}:\n${items}`
      }
      if (typeof v === 'object' && v !== null) {
        const inner = Object.entries(v)
          .map(([ik, iv]) => `  ${ik}: ${JSON.stringify(iv)}`)
          .join('\n')
        return `${k}:\n${inner}`
      }
      return `${k}: ${JSON.stringify(v)}`
    })
    .join('\n')

  const content = `---\n${yaml}\n---\n\n${body}`
  writeFileSync(join(agentsDir, filename), content)
}

/**
 * Create a minimal valid plugin package on disk and return its path.
 */
function createPluginPackage(opts?: {
  manifest?: Partial<KombusePluginManifest>
  agents?: Array<{
    filename: string
    frontmatter: Record<string, unknown>
    body: string
  }>
}): string {
  const dir = mkdtempSync(join(tmpdir(), 'plugin-import-test-'))
  const manifest = createManifest(opts?.manifest)
  writeManifest(dir, manifest)

  if (opts?.agents) {
    for (const agent of opts.agents) {
      writeAgentFile(dir, agent.filename, agent.frontmatter, agent.body)
    }
  }

  return dir
}

// --- Tests ---

describe('pluginImportService', () => {
  let cleanup: () => void
  let tempDirs: string[] = []

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    tempDirs = []
  })

  afterEach(() => {
    cleanup()
    for (const dir of tempDirs) {
      if (existsSync(dir)) rmSync(dir, { recursive: true })
    }
  })

  function trackDir(dir: string): string {
    tempDirs.push(dir)
    return dir
  }

  describe('installPackage — happy path', () => {
    it('should install a plugin with agents, labels, and triggers', () => {
      const pkg = trackDir(
        createPluginPackage({
          manifest: {
            name: 'my-plugin',
            kombuse: {
              plugin_system_version: 'kombuse-plugin-v1',
              project_id: TEST_PROJECT_ID,
              exported_at: new Date().toISOString(),
              labels: [{ name: 'Bug', color: '#d73a4a', description: null }],
            },
          },
          agents: [
            {
              filename: 'test-agent.md',
              frontmatter: {
                name: 'Test Agent',
                slug: 'test-agent',
                description: 'A test agent',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [
                  {
                    event_type: 'ticket.created',
                    conditions: null,
                    is_enabled: true,
                    priority: 5,
                  },
                ],
              },
              body: 'You are a test agent.',
            },
          ],
        })
      )

      const result = pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      expect(result.plugin_name).toBe('my-plugin')
      expect(result.agents_created).toBe(1)
      expect(result.labels_created).toBe(1)
      expect(result.labels_merged).toBe(0)
      expect(result.triggers_created).toBe(1)
      expect(result.warnings).toEqual([])

      // Verify plugin row
      const plugin = pluginsRepository.get(result.plugin_id)
      expect(plugin).not.toBeNull()
      expect(plugin!.name).toBe('my-plugin')
      expect(plugin!.project_id).toBe(TEST_PROJECT_ID)

      // Verify label created with plugin_id
      const labels = labelsRepository.getByProject(TEST_PROJECT_ID)
      const bugLabel = labels.find((l) => l.name === 'Bug')
      expect(bugLabel).toBeDefined()
      expect(bugLabel!.plugin_id).toBe(result.plugin_id)
    })

    it('should create profiles for imported agents', () => {
      const pkg = trackDir(
        createPluginPackage({
          agents: [
            {
              filename: 'my-agent.md',
              frontmatter: {
                name: 'My Agent',
                slug: 'my-agent',
                description: 'Agent desc',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [],
              },
              body: 'You are my agent.',
            },
          ],
        })
      )

      const result = pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      // Verify profile was created
      const agents = agentsRepository.list({ limit: 100 })
      const agent = agents.find((a) => a.slug === 'my-agent')
      expect(agent).toBeDefined()

      const profile = profilesRepository.get(agent!.id)
      expect(profile).not.toBeNull()
      expect(profile!.name).toBe('My Agent')
      expect(profile!.type).toBe('agent')
    })

    it('should handle empty package with no agents directory', () => {
      const pkg = trackDir(createPluginPackage())

      const result = pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      expect(result.agents_created).toBe(0)
      expect(result.labels_created).toBe(0)
      expect(result.triggers_created).toBe(0)

      // Plugin row should still exist
      const plugin = pluginsRepository.get(result.plugin_id)
      expect(plugin).not.toBeNull()
    })

    it('should install multiple agents with triggers', () => {
      const pkg = trackDir(
        createPluginPackage({
          agents: [
            {
              filename: 'agent-a.md',
              frontmatter: {
                name: 'Agent A',
                slug: 'agent-a',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [
                  { event_type: 'ticket.created', conditions: null, is_enabled: true, priority: 0 },
                ],
              },
              body: 'Prompt A',
            },
            {
              filename: 'agent-b.md',
              frontmatter: {
                name: 'Agent B',
                slug: 'agent-b',
                type: 'coder',
                model: 'gpt-4o',
                is_enabled: true,
                enabled_for_chat: true,
                permissions: [],
                triggers: [
                  { event_type: 'comment.added', conditions: null, is_enabled: true, priority: 10 },
                  { event_type: 'ticket.updated', conditions: null, is_enabled: true, priority: 5 },
                ],
              },
              body: 'Prompt B',
            },
          ],
        })
      )

      const result = pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      expect(result.agents_created).toBe(2)
      expect(result.triggers_created).toBe(3)
    })
  })

  describe('label handling', () => {
    it('should merge with existing label of same name', () => {
      // Pre-create a label
      labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'Bug',
        color: '#d73a4a',
      })

      const pkg = trackDir(
        createPluginPackage({
          manifest: {
            name: 'label-merge-plugin',
            kombuse: {
              plugin_system_version: 'kombuse-plugin-v1',
              project_id: TEST_PROJECT_ID,
              exported_at: new Date().toISOString(),
              labels: [{ name: 'Bug', color: '#d73a4a', description: null }],
            },
          },
        })
      )

      const result = pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      expect(result.labels_merged).toBe(1)
      expect(result.labels_created).toBe(0)

      // Verify the existing label was linked (not duplicated)
      const labels = labelsRepository.getByProject(TEST_PROJECT_ID)
      const bugLabels = labels.filter((l) => l.name === 'Bug')
      expect(bugLabels).toHaveLength(1)
      expect(bugLabels[0]!.plugin_id).toBe(result.plugin_id)
    })

    it('should create new labels that do not exist', () => {
      const pkg = trackDir(
        createPluginPackage({
          manifest: {
            name: 'label-create-plugin',
            kombuse: {
              plugin_system_version: 'kombuse-plugin-v1',
              project_id: TEST_PROJECT_ID,
              exported_at: new Date().toISOString(),
              labels: [
                { name: 'NewLabel', color: '#00ff00', description: null },
                { name: 'AnotherLabel', color: '#ff0000', description: null },
              ],
            },
          },
        })
      )

      const result = pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      expect(result.labels_created).toBe(2)
      expect(result.labels_merged).toBe(0)

      const labels = labelsRepository.getByProject(TEST_PROJECT_ID)
      expect(labels.find((l) => l.name === 'NewLabel')).toBeDefined()
      expect(labels.find((l) => l.name === 'AnotherLabel')).toBeDefined()
    })
  })

  describe('slug match — update in place', () => {
    it('should update existing agent in place when slug matches', () => {
      // Pre-create an agent with the same slug
      const existingId = crypto.randomUUID()
      profilesRepository.create({ id: existingId, type: 'agent', name: 'Existing' })
      agentsRepository.create({
        id: existingId,
        name: 'Existing',
        description: 'Existing agent',
        slug: 'collide-agent',
        system_prompt: 'old prompt',
      })

      const pkg = trackDir(
        createPluginPackage({
          manifest: { name: 'my-plugin' },
          agents: [
            {
              filename: 'collide-agent.md',
              frontmatter: {
                name: 'Updated Agent',
                slug: 'collide-agent',
                description: 'Updated description',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [],
              },
              body: 'Updated prompt',
            },
          ],
        })
      )

      const result = pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      // Should update, not create
      expect(result.agents_created).toBe(0)
      expect(result.agents_updated).toBe(1)
      expect(result.warnings).toEqual([])

      // Agent ID should be preserved
      const agent = agentsRepository.getBySlug('collide-agent')
      expect(agent).not.toBeNull()
      expect(agent!.id).toBe(existingId)
      expect(agent!.system_prompt).toBe('Updated prompt')
      expect(agent!.plugin_id).toBe(result.plugin_id)

      // Profile should be updated
      const profile = profilesRepository.get(existingId)
      expect(profile!.name).toBe('Updated Agent')
      expect(profile!.description).toBe('Updated description')
    })

    it('should replace triggers when updating existing agent', () => {
      const existingId = crypto.randomUUID()
      profilesRepository.create({ id: existingId, type: 'agent', name: 'Existing' })
      agentsRepository.create({
        id: existingId,
        name: 'Existing',
        description: 'Existing',
        slug: 'trigger-agent',
        system_prompt: 'old prompt',
      })
      // Create an old trigger
      agentTriggersRepository.create({
        agent_id: existingId,
        event_type: 'ticket.created',
        is_enabled: true,
        priority: 0,
      })

      const pkg = trackDir(
        createPluginPackage({
          agents: [
            {
              filename: 'trigger-agent.md',
              frontmatter: {
                name: 'Trigger Agent',
                slug: 'trigger-agent',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [
                  { event_type: 'comment.added', conditions: null, is_enabled: true, priority: 5 },
                ],
              },
              body: 'New prompt',
            },
          ],
        })
      )

      const result = pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      expect(result.agents_updated).toBe(1)
      expect(result.triggers_created).toBe(1)

      // Old trigger should be gone, new one should exist
      const triggers = agentTriggersRepository.listByAgent(existingId)
      expect(triggers).toHaveLength(1)
      expect(triggers[0]!.event_type).toBe('comment.added')
    })

    it('should create new agents that do not match existing slugs', () => {
      // Pre-create an agent with a different slug
      const existingId = crypto.randomUUID()
      profilesRepository.create({ id: existingId, type: 'agent', name: 'Existing' })
      agentsRepository.create({
        id: existingId,
        name: 'Existing',
        description: 'Existing agent',
        slug: 'existing-agent',
        system_prompt: 'existing',
      })

      const pkg = trackDir(
        createPluginPackage({
          agents: [
            {
              filename: 'new-agent.md',
              frontmatter: {
                name: 'New Agent',
                slug: 'new-agent',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [],
              },
              body: 'New prompt',
            },
          ],
        })
      )

      const result = pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      expect(result.agents_created).toBe(1)
      expect(result.agents_updated).toBe(0)

      // New agent should exist
      const newAgent = agentsRepository.getBySlug('new-agent')
      expect(newAgent).not.toBeNull()
      expect(newAgent!.plugin_id).toBe(result.plugin_id)

      // Existing agent should be untouched
      const existing = agentsRepository.getBySlug('existing-agent')
      expect(existing).not.toBeNull()
      expect(existing!.id).toBe(existingId)
    })
  })

  describe('trigger resolution', () => {
    it('should resolve $SELF placeholder to agent profile ID', () => {
      const pkg = trackDir(
        createPluginPackage({
          agents: [
            {
              filename: 'self-agent.md',
              frontmatter: {
                name: 'Self Agent',
                slug: 'self-agent',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [
                  {
                    event_type: 'mention.created',
                    conditions: {
                      mention_type: 'profile',
                      mentioned_profile_id: SELF_PLACEHOLDER,
                    },
                    is_enabled: true,
                    priority: 0,
                  },
                ],
              },
              body: 'Self prompt',
            },
          ],
        })
      )

      pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      // Find the created agent
      const agent = agentsRepository.getBySlug('self-agent')
      expect(agent).not.toBeNull()

      // Verify the trigger condition has actual agent ID, not $SELF
      const triggers = agentTriggersRepository.listByAgent(agent!.id)
      expect(triggers).toHaveLength(1)
      expect(triggers[0]!.conditions).toEqual({
        mention_type: 'profile',
        mentioned_profile_id: agent!.id,
      })
    })

    it('should resolve label_name to label_id in trigger conditions', () => {
      // Pre-create a label
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'Bug',
        color: '#d73a4a',
      })

      const pkg = trackDir(
        createPluginPackage({
          manifest: {
            name: 'label-resolve-plugin',
            kombuse: {
              plugin_system_version: 'kombuse-plugin-v1',
              project_id: TEST_PROJECT_ID,
              exported_at: new Date().toISOString(),
              labels: [{ name: 'Bug', color: '#d73a4a', description: null }],
            },
          },
          agents: [
            {
              filename: 'label-agent.md',
              frontmatter: {
                name: 'Label Agent',
                slug: 'label-agent',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [
                  {
                    event_type: 'label.added',
                    conditions: { label_name: 'Bug' },
                    is_enabled: true,
                    priority: 0,
                  },
                ],
              },
              body: 'Label prompt',
            },
          ],
        })
      )

      pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      const agent = agentsRepository.getBySlug('label-agent')
      const triggers = agentTriggersRepository.listByAgent(agent!.id)
      expect(triggers).toHaveLength(1)
      expect(triggers[0]!.conditions).toEqual({ label_id: label.id })
    })

    it('should keep label_name if label cannot be resolved', () => {
      const pkg = trackDir(
        createPluginPackage({
          agents: [
            {
              filename: 'unresolved-agent.md',
              frontmatter: {
                name: 'Unresolved Agent',
                slug: 'unresolved-agent',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [
                  {
                    event_type: 'label.added',
                    conditions: { label_name: 'NonExistent' },
                    is_enabled: true,
                    priority: 0,
                  },
                ],
              },
              body: 'Unresolved prompt',
            },
          ],
        })
      )

      pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      const agent = agentsRepository.getBySlug('unresolved-agent')
      const triggers = agentTriggersRepository.listByAgent(agent!.id)
      expect(triggers).toHaveLength(1)
      expect(triggers[0]!.conditions).toEqual({ label_name: 'NonExistent' })
    })

    it('should resolve label_name for newly created labels', () => {
      const pkg = trackDir(
        createPluginPackage({
          manifest: {
            name: 'new-label-plugin',
            kombuse: {
              plugin_system_version: 'kombuse-plugin-v1',
              project_id: TEST_PROJECT_ID,
              exported_at: new Date().toISOString(),
              labels: [{ name: 'NewLabel', color: '#00ff00', description: null }],
            },
          },
          agents: [
            {
              filename: 'new-label-agent.md',
              frontmatter: {
                name: 'New Label Agent',
                slug: 'new-label-agent',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [
                  {
                    event_type: 'label.added',
                    conditions: { label_name: 'NewLabel' },
                    is_enabled: true,
                    priority: 0,
                  },
                ],
              },
              body: 'prompt',
            },
          ],
        })
      )

      pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      const agent = agentsRepository.getBySlug('new-label-agent')
      const triggers = agentTriggersRepository.listByAgent(agent!.id)
      const newLabel = labelsRepository.getByProject(TEST_PROJECT_ID).find((l) => l.name === 'NewLabel')
      expect(newLabel).toBeDefined()
      expect(triggers[0]!.conditions).toEqual({ label_id: newLabel!.id })
    })
  })

  describe('overwrite mode', () => {
    it('should preserve agent ID when overwrite reinstalls a plugin', () => {
      const pkg = trackDir(
        createPluginPackage({
          manifest: { name: 'overwrite-plugin' },
          agents: [
            {
              filename: 'ow-agent.md',
              frontmatter: {
                name: 'OW Agent',
                slug: 'ow-agent',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [],
              },
              body: 'v1 prompt',
            },
          ],
        })
      )

      // First install
      const first = pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })
      expect(first.agents_created).toBe(1)
      const originalAgent = agentsRepository.getBySlug('ow-agent')
      const originalId = originalAgent!.id

      // Second install with overwrite
      const second = pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
        overwrite: true,
      })

      // Agent should be updated, not recreated
      expect(second.agents_created).toBe(0)
      expect(second.agents_updated).toBe(1)
      expect(second.plugin_id).not.toBe(first.plugin_id)

      // Agent ID should be preserved
      const updatedAgent = agentsRepository.getBySlug('ow-agent')
      expect(updatedAgent!.id).toBe(originalId)
      expect(updatedAgent!.plugin_id).toBe(second.plugin_id)

      // Old plugin should be gone
      expect(pluginsRepository.get(first.plugin_id)).toBeNull()

      // New plugin should exist
      expect(pluginsRepository.get(second.plugin_id)).not.toBeNull()
    })

    it('should delete agents from old plugin not in new manifest', () => {
      const pkg1 = trackDir(
        createPluginPackage({
          manifest: { name: 'shrinking-plugin' },
          agents: [
            {
              filename: 'keep-agent.md',
              frontmatter: { name: 'Keep', slug: 'keep-agent', type: 'kombuse', is_enabled: true, enabled_for_chat: false, permissions: [], triggers: [] },
              body: 'keep prompt',
            },
            {
              filename: 'remove-agent.md',
              frontmatter: { name: 'Remove', slug: 'remove-agent', type: 'kombuse', is_enabled: true, enabled_for_chat: false, permissions: [], triggers: [] },
              body: 'remove prompt',
            },
          ],
        })
      )

      const first = pluginImportService.installPackage({
        package_path: pkg1,
        project_id: TEST_PROJECT_ID,
      })
      expect(first.agents_created).toBe(2)

      // Second package only has keep-agent
      const pkg2 = trackDir(
        createPluginPackage({
          manifest: { name: 'shrinking-plugin' },
          agents: [
            {
              filename: 'keep-agent.md',
              frontmatter: { name: 'Keep Updated', slug: 'keep-agent', type: 'kombuse', is_enabled: true, enabled_for_chat: false, permissions: [], triggers: [] },
              body: 'keep prompt v2',
            },
          ],
        })
      )

      const second = pluginImportService.installPackage({
        package_path: pkg2,
        project_id: TEST_PROJECT_ID,
        overwrite: true,
      })

      expect(second.agents_updated).toBe(1)
      expect(second.agents_created).toBe(0)

      // keep-agent should still exist with updated prompt
      const kept = agentsRepository.getBySlug('keep-agent')
      expect(kept).not.toBeNull()
      expect(kept!.system_prompt).toBe('keep prompt v2')

      // remove-agent should be gone
      expect(agentsRepository.getBySlug('remove-agent')).toBeNull()
    })

    it('should preserve ticket-label associations when labels have matching slugs', () => {
      const pkg = trackDir(
        createPluginPackage({
          manifest: {
            name: 'label-preserve-plugin',
            kombuse: {
              plugin_system_version: 'kombuse-plugin-v1',
              project_id: TEST_PROJECT_ID,
              exported_at: new Date().toISOString(),
              labels: [
                { name: 'Bug', color: '#d73a4a', description: null },
                { name: 'Feature', color: '#00ff00', description: null },
              ],
            },
          },
        })
      )

      // First install
      pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      // Get the created labels and apply them to tickets
      const labels = labelsRepository.getByProject(TEST_PROJECT_ID)
      const bugLabel = labels.find((l) => l.name === 'Bug')!
      const featureLabel = labels.find((l) => l.name === 'Feature')!

      // Create tickets and apply labels
      const db = getDatabase()
      db.prepare(
        "INSERT INTO tickets (project_id, title, author_id) VALUES (?, 'T1', ?)"
      ).run(TEST_PROJECT_ID, TEST_USER_ID)
      db.prepare(
        "INSERT INTO tickets (project_id, title, author_id) VALUES (?, 'T2', ?)"
      ).run(TEST_PROJECT_ID, TEST_USER_ID)
      const tickets = db
        .prepare('SELECT id FROM tickets WHERE project_id = ? ORDER BY id')
        .all(TEST_PROJECT_ID) as { id: number }[]

      labelsRepository.addToTicket(tickets[0]!.id, bugLabel.id)
      labelsRepository.addToTicket(tickets[1]!.id, bugLabel.id)
      labelsRepository.addToTicket(tickets[1]!.id, featureLabel.id)

      // Overwrite reinstall
      pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
        overwrite: true,
      })

      // Tickets should still have labels with matching names
      const t1Labels = labelsRepository.getTicketLabels(tickets[0]!.id)
      expect(t1Labels).toHaveLength(1)
      expect(t1Labels[0]!.name).toBe('Bug')

      const t2Labels = labelsRepository.getTicketLabels(tickets[1]!.id)
      expect(t2Labels).toHaveLength(2)
      expect(t2Labels.map((l) => l.name).sort()).toEqual(['Bug', 'Feature'])
    })

    it('should orphan labels removed from new manifest with ticket associations intact', () => {
      const pkg1 = trackDir(
        createPluginPackage({
          manifest: {
            name: 'shrinking-label-plugin',
            kombuse: {
              plugin_system_version: 'kombuse-plugin-v1',
              project_id: TEST_PROJECT_ID,
              exported_at: new Date().toISOString(),
              labels: [
                { name: 'Bug', color: '#d73a4a', description: null },
                { name: 'Removed', color: '#ff0000', description: null },
              ],
            },
          },
        })
      )

      // First install
      pluginImportService.installPackage({
        package_path: pkg1,
        project_id: TEST_PROJECT_ID,
      })

      // Apply the "Removed" label to a ticket
      const removedLabel = labelsRepository.getByProject(TEST_PROJECT_ID).find((l) => l.name === 'Removed')!
      const db = getDatabase()
      db.prepare(
        "INSERT INTO tickets (project_id, title, author_id) VALUES (?, 'T1', ?)"
      ).run(TEST_PROJECT_ID, TEST_USER_ID)
      const ticket = db
        .prepare('SELECT id FROM tickets WHERE project_id = ? ORDER BY id DESC LIMIT 1')
        .get(TEST_PROJECT_ID) as { id: number }
      labelsRepository.addToTicket(ticket.id, removedLabel.id)

      // Second install only has "Bug" (Removed is dropped from manifest)
      const pkg2 = trackDir(
        createPluginPackage({
          manifest: {
            name: 'shrinking-label-plugin',
            kombuse: {
              plugin_system_version: 'kombuse-plugin-v1',
              project_id: TEST_PROJECT_ID,
              exported_at: new Date().toISOString(),
              labels: [
                { name: 'Bug', color: '#d73a4a', description: null },
              ],
            },
          },
        })
      )

      pluginImportService.installPackage({
        package_path: pkg2,
        project_id: TEST_PROJECT_ID,
        overwrite: true,
      })

      // "Removed" label should still exist as orphan with ticket association intact
      const allLabels = labelsRepository.getByProject(TEST_PROJECT_ID, true)
      const orphanedLabel = allLabels.find((l) => l.name === 'Removed')
      expect(orphanedLabel, 'Removed label should still exist').toBeDefined()
      expect(orphanedLabel!.plugin_id, 'Removed label should be orphaned').toBeNull()

      const ticketLabels = labelsRepository.getTicketLabels(ticket.id)
      expect(ticketLabels.map((l) => l.name), 'Ticket should still have Removed label').toContain('Removed')
    })
  })

  describe('uninstall (delete) then reinstall — profile reuse', () => {
    it('should reuse soft-deleted profile on reinstall instead of creating a duplicate', () => {
      const pkg = trackDir(
        createPluginPackage({
          manifest: { name: 'reinstall-plugin' },
          agents: [
            {
              filename: 'reinstall-agent.md',
              frontmatter: {
                name: 'Reinstall Agent',
                slug: 'reinstall-agent',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [],
              },
              body: 'v1 prompt',
            },
          ],
        })
      )

      // First install
      const first = pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })
      expect(first.agents_created).toBe(1)
      const originalProfile = profilesRepository.getBySlug('reinstall-agent')
      expect(originalProfile).not.toBeNull()
      const originalId = originalProfile!.id
      expect(originalProfile!.is_active).toBe(true)

      // Uninstall with delete mode
      pluginLifecycleService.uninstallPlugin(first.plugin_id, 'delete')

      // Agent should be gone, profile should be soft-deleted
      expect(agentsRepository.getBySlug('reinstall-agent')).toBeNull()
      const deletedProfile = profilesRepository.getBySlug('reinstall-agent')
      expect(deletedProfile).not.toBeNull()
      expect(deletedProfile!.is_active).toBe(false)

      // Reinstall
      const second = pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })
      expect(second.agents_created).toBe(1)

      // Profile should be reactivated with the same ID
      const reinstalledProfile = profilesRepository.getBySlug('reinstall-agent')
      expect(reinstalledProfile).not.toBeNull()
      expect(reinstalledProfile!.id, 'Profile ID should be preserved across reinstall').toBe(originalId)
      expect(reinstalledProfile!.is_active, 'Profile should be active after reinstall').toBe(true)

      // Agent should point to the same profile
      const reinstalledAgent = agentsRepository.getBySlug('reinstall-agent')
      expect(reinstalledAgent).not.toBeNull()
      expect(reinstalledAgent!.id).toBe(originalId)

      // No orphaned profiles
      const db = getDatabase()
      const count = db
        .prepare('SELECT COUNT(*) as cnt FROM profiles WHERE slug = ?')
        .get('reinstall-agent') as { cnt: number }
      expect(count.cnt, 'Should have exactly one profile for this slug').toBe(1)
    })

    it('should create a fresh profile when installing for the first time', () => {
      const pkg = trackDir(
        createPluginPackage({
          manifest: { name: 'fresh-plugin' },
          agents: [
            {
              filename: 'fresh-agent.md',
              frontmatter: {
                name: 'Fresh Agent',
                slug: 'fresh-agent',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [],
              },
              body: 'fresh prompt',
            },
          ],
        })
      )

      const result = pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })
      expect(result.agents_created).toBe(1)

      const profile = profilesRepository.getBySlug('fresh-agent')
      expect(profile).not.toBeNull()
      expect(profile!.slug).toBe('fresh-agent')
      expect(profile!.is_active).toBe(true)
    })
  })

  describe('error cases', () => {
    it('should throw PluginAlreadyInstalledError when installing duplicate without overwrite', () => {
      const pkg = trackDir(
        createPluginPackage({ manifest: { name: 'dup-plugin' } })
      )

      pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      expect(() =>
        pluginImportService.installPackage({
          package_path: pkg,
          project_id: TEST_PROJECT_ID,
        })
      ).toThrow(PluginAlreadyInstalledError)
    })

    it('should include plugin name in PluginAlreadyInstalledError', () => {
      const pkg = trackDir(
        createPluginPackage({ manifest: { name: 'named-dup' } })
      )

      pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      try {
        pluginImportService.installPackage({
          package_path: pkg,
          project_id: TEST_PROJECT_ID,
        })
        expect.unreachable('Should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(PluginAlreadyInstalledError)
        expect((e as PluginAlreadyInstalledError).pluginName).toBe('named-dup')
      }
    })

    it('should throw InvalidManifestError when plugin.json is missing', () => {
      const dir = trackDir(mkdtempSync(join(tmpdir(), 'no-manifest-')))

      expect(() =>
        pluginImportService.installPackage({
          package_path: dir,
          project_id: TEST_PROJECT_ID,
        })
      ).toThrow(InvalidManifestError)
    })

    it('should throw InvalidManifestError when manifest has no name', () => {
      const dir = trackDir(mkdtempSync(join(tmpdir(), 'no-name-')))
      const metaDir = join(dir, '.claude-plugin')
      mkdirSync(metaDir, { recursive: true })
      writeFileSync(
        join(metaDir, 'plugin.json'),
        JSON.stringify({
          version: '1.0.0',
          kombuse: { plugin_system_version: 'kombuse-plugin-v1' },
        })
      )

      expect(() =>
        pluginImportService.installPackage({
          package_path: dir,
          project_id: TEST_PROJECT_ID,
        })
      ).toThrow(InvalidManifestError)
    })

    it('should throw InvalidManifestError when manifest has no plugin_system_version', () => {
      const dir = trackDir(mkdtempSync(join(tmpdir(), 'no-version-')))
      const metaDir = join(dir, '.claude-plugin')
      mkdirSync(metaDir, { recursive: true })
      writeFileSync(
        join(metaDir, 'plugin.json'),
        JSON.stringify({ name: 'test', version: '1.0.0' })
      )

      expect(() =>
        pluginImportService.installPackage({
          package_path: dir,
          project_id: TEST_PROJECT_ID,
        })
      ).toThrow(InvalidManifestError)
    })

    it('should throw InvalidManifestError when plugin.json is invalid JSON', () => {
      const dir = trackDir(mkdtempSync(join(tmpdir(), 'bad-json-')))
      const metaDir = join(dir, '.claude-plugin')
      mkdirSync(metaDir, { recursive: true })
      writeFileSync(join(metaDir, 'plugin.json'), '{not valid json}}}')

      expect(() =>
        pluginImportService.installPackage({
          package_path: dir,
          project_id: TEST_PROJECT_ID,
        })
      ).toThrow(InvalidManifestError)
    })

    it('should throw InvalidManifestError when agent file has no frontmatter', () => {
      const pkg = trackDir(
        createPluginPackage()
      )
      // Write a bad agent file (no YAML frontmatter)
      const agentsDir = join(pkg, 'agents')
      mkdirSync(agentsDir, { recursive: true })
      writeFileSync(join(agentsDir, 'bad-agent.md'), 'Just plain text, no frontmatter')

      expect(() =>
        pluginImportService.installPackage({
          package_path: pkg,
          project_id: TEST_PROJECT_ID,
        })
      ).toThrow(InvalidManifestError)
    })
  })

  describe('agent config reconstruction', () => {
    it('should reconstruct agent config from promoted frontmatter keys', () => {
      const pkg = trackDir(
        createPluginPackage({
          agents: [
            {
              filename: 'config-agent.md',
              frontmatter: {
                name: 'Config Agent',
                slug: 'config-agent',
                type: 'coder',
                model: 'gpt-4o',
                backend_type: 'claude-code',
                enabled_for_chat: true,
                is_enabled: true,
                permissions: [],
                triggers: [],
                config: { max_tokens: 4096, temperature: 0.7 },
              },
              body: 'Config prompt',
            },
          ],
        })
      )

      pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      const agent = agentsRepository.getBySlug('config-agent')
      expect(agent).not.toBeNull()
      expect(agent!.config).toMatchObject({
        type: 'coder',
        model: 'gpt-4o',
        backend_type: 'claude-code',
        enabled_for_chat: true,
        max_tokens: 4096,
        temperature: 0.7,
      })
    })
  })

  describe('plugin_base tracking', () => {
    it('should set plugin_base when creating an agent', () => {
      const pkg = trackDir(
        createPluginPackage({
          agents: [
            {
              filename: 'tracked-agent.md',
              frontmatter: {
                name: 'Tracked Agent',
                slug: 'tracked-agent',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [],
              },
              body: 'Tracked prompt',
            },
          ],
        })
      )

      pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      const agent = agentsRepository.getBySlug('tracked-agent')
      expect(agent).not.toBeNull()
      expect(agent!.plugin_base).not.toBeNull()
      expect(agent!.plugin_base!.system_prompt).toBe('Tracked prompt')
      expect(agent!.plugin_base!.is_enabled).toBe(true)
      expect(agent!.plugin_base!.permissions).toEqual([])
    })

    it('should preserve user-customized system_prompt on reinstall', () => {
      const pkg = trackDir(
        createPluginPackage({
          manifest: { name: 'custom-plugin' },
          agents: [
            {
              filename: 'custom-agent.md',
              frontmatter: {
                name: 'Custom Agent',
                slug: 'custom-agent',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [],
              },
              body: 'v1 prompt',
            },
          ],
        })
      )

      // First install
      pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      // User customizes system_prompt
      const agent = agentsRepository.getBySlug('custom-agent')
      agentsRepository.update(agent!.id, { system_prompt: 'User custom prompt' })

      // Create v2 plugin with new prompt
      const pkg2 = trackDir(
        createPluginPackage({
          manifest: { name: 'custom-plugin' },
          agents: [
            {
              filename: 'custom-agent.md',
              frontmatter: {
                name: 'Custom Agent',
                slug: 'custom-agent',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [],
              },
              body: 'v2 prompt',
            },
          ],
        })
      )

      // Reinstall
      pluginImportService.installPackage({
        package_path: pkg2,
        project_id: TEST_PROJECT_ID,
        overwrite: true,
      })

      // User's customized prompt should be preserved
      const updated = agentsRepository.getBySlug('custom-agent')
      expect(updated!.system_prompt).toBe('User custom prompt')
      // plugin_base should reflect v2
      expect(updated!.plugin_base!.system_prompt).toBe('v2 prompt')
    })

    it('should overwrite non-customized fields on reinstall', () => {
      const pkg = trackDir(
        createPluginPackage({
          manifest: { name: 'overwrite-plugin' },
          agents: [
            {
              filename: 'ow-agent.md',
              frontmatter: {
                name: 'OW Agent',
                slug: 'ow-agent',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [],
              },
              body: 'v1 prompt',
            },
          ],
        })
      )

      pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      // User does NOT customize anything

      // v2 with updated prompt
      const pkg2 = trackDir(
        createPluginPackage({
          manifest: { name: 'overwrite-plugin' },
          agents: [
            {
              filename: 'ow-agent.md',
              frontmatter: {
                name: 'OW Agent',
                slug: 'ow-agent',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [],
              },
              body: 'v2 prompt',
            },
          ],
        })
      )

      pluginImportService.installPackage({
        package_path: pkg2,
        project_id: TEST_PROJECT_ID,
        overwrite: true,
      })

      // Non-customized field should be overwritten to v2
      const updated = agentsRepository.getBySlug('ow-agent')
      expect(updated!.system_prompt).toBe('v2 prompt')
      expect(updated!.plugin_base!.system_prompt).toBe('v2 prompt')
    })

    it('should update plugin_base to latest values even when fields are customized', () => {
      const pkg = trackDir(
        createPluginPackage({
          manifest: { name: 'base-update-plugin' },
          agents: [
            {
              filename: 'base-agent.md',
              frontmatter: {
                name: 'Base Agent',
                slug: 'base-agent',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [],
              },
              body: 'v1 prompt',
            },
          ],
        })
      )

      pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      // User customizes
      const agent = agentsRepository.getBySlug('base-agent')
      agentsRepository.update(agent!.id, { system_prompt: 'Custom' })

      // v2
      const pkg2 = trackDir(
        createPluginPackage({
          manifest: { name: 'base-update-plugin' },
          agents: [
            {
              filename: 'base-agent.md',
              frontmatter: {
                name: 'Base Agent',
                slug: 'base-agent',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [],
              },
              body: 'v2 prompt',
            },
          ],
        })
      )

      pluginImportService.installPackage({
        package_path: pkg2,
        project_id: TEST_PROJECT_ID,
        overwrite: true,
      })

      const updated = agentsRepository.getBySlug('base-agent')
      // User's custom prompt preserved
      expect(updated!.system_prompt).toBe('Custom')
      // plugin_base always reflects latest plugin values
      expect(updated!.plugin_base!.system_prompt).toBe('v2 prompt')
    })
  })
})
