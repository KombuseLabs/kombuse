import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  setupTestDb,
  TEST_PROJECT_ID,
} from '@kombuse/persistence/test-utils'
import {
  agentsRepository,
  agentTriggersRepository,
  labelsRepository,
  pluginsRepository,
  profilesRepository,
} from '@kombuse/persistence'
import { SELF_PLACEHOLDER } from '@kombuse/types'
import type { KombusePluginManifest } from '@kombuse/types'
import {
  pluginImportService,
  PluginAlreadyInstalledError,
  InvalidManifestError,
} from '../plugin-import-service'

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

  describe('slug collision handling', () => {
    it('should suffix slug when collision exists', () => {
      // Pre-create an agent with the same slug
      const existingId = crypto.randomUUID()
      profilesRepository.create({ id: existingId, type: 'agent', name: 'Existing' })
      agentsRepository.create({
        id: existingId,
        name: 'Existing',
        description: 'Existing agent',
        slug: 'collide-agent',
        system_prompt: 'existing',
      })

      const pkg = trackDir(
        createPluginPackage({
          manifest: { name: 'my-plugin' },
          agents: [
            {
              filename: 'collide-agent.md',
              frontmatter: {
                name: 'Collide Agent',
                slug: 'collide-agent',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [],
              },
              body: 'Collide prompt',
            },
          ],
        })
      )

      const result = pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('collide-agent')
      expect(result.warnings[0]).toContain('collide-agent-my-plugin')

      // Verify new agent has suffixed slug
      const newAgent = agentsRepository.getBySlug('collide-agent-my-plugin')
      expect(newAgent).not.toBeNull()
      expect(newAgent!.plugin_id).toBe(result.plugin_id)
    })

    it('should add timestamp suffix on double collision', () => {
      // Create two agents that block both slug variants
      const id1 = crypto.randomUUID()
      profilesRepository.create({ id: id1, type: 'agent', name: 'Existing 1' })
      agentsRepository.create({ id: id1, name: 'Existing 1', description: 'e1', slug: 'double-collide', system_prompt: 'p1' })

      const id2 = crypto.randomUUID()
      profilesRepository.create({ id: id2, type: 'agent', name: 'Existing 2' })
      agentsRepository.create({ id: id2, name: 'Existing 2', description: 'e2', slug: 'double-collide-test-plugin', system_prompt: 'p2' })

      const pkg = trackDir(
        createPluginPackage({
          manifest: { name: 'test-plugin' },
          agents: [
            {
              filename: 'double-collide.md',
              frontmatter: {
                name: 'Double Collide',
                slug: 'double-collide',
                type: 'kombuse',
                is_enabled: true,
                enabled_for_chat: false,
                permissions: [],
                triggers: [],
              },
              body: 'prompt',
            },
          ],
        })
      )

      const result = pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
      })

      expect(result.agents_created).toBe(1)
      // The warning should mention the first collision
      expect(result.warnings).toHaveLength(1)

      // The final slug should contain a timestamp suffix
      const agents = agentsRepository.list({ limit: 100 })
      const pluginAgent = agents.find((a) => a.plugin_id === result.plugin_id)
      expect(pluginAgent).toBeDefined()
      expect(pluginAgent!.slug).toMatch(/^double-collide-test-plugin-\d+$/)
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
    it('should replace existing plugin when overwrite is true', () => {
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

      // Second install with overwrite
      const second = pluginImportService.installPackage({
        package_path: pkg,
        project_id: TEST_PROJECT_ID,
        overwrite: true,
      })

      expect(second.agents_created).toBe(1)
      expect(second.plugin_id).not.toBe(first.plugin_id)

      // Old plugin should be gone
      expect(pluginsRepository.get(first.plugin_id)).toBeNull()

      // New plugin should exist
      expect(pluginsRepository.get(second.plugin_id)).not.toBeNull()
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
})
