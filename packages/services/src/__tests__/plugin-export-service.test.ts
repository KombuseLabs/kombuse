import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as yaml from 'js-yaml'
import {
  setupTestDb,
  TEST_USER_ID,
} from '@kombuse/persistence/test-utils'
import {
  agentsRepository,
  agentTriggersRepository,
  labelsRepository,
  profilesRepository,
  projectsRepository,
} from '@kombuse/persistence'
import { ANONYMOUS_AGENT_ID } from '@kombuse/types'
import { pluginExportService, PackageExistsError } from '../plugin-export-service'

let agentCounter = 0

function createTestAgent(overrides?: {
  id?: string
  config?: Record<string, unknown>
  permissions?: Array<Record<string, unknown>>
  is_enabled?: boolean
  system_prompt?: string
  profileName?: string
  profileDescription?: string
  profileAvatar?: string
}) {
  const id = overrides?.id ?? `test-agent-${++agentCounter}-${Date.now()}`
  profilesRepository.create({
    id,
    type: 'agent',
    name: overrides?.profileName ?? `Agent ${agentCounter}`,
    description: overrides?.profileDescription,
    avatar_url: overrides?.profileAvatar,
  })
  return agentsRepository.create({
    id,
    name: overrides?.profileName ?? `Agent ${agentCounter}`,
    description: overrides?.profileDescription ?? 'Test agent',
    system_prompt: overrides?.system_prompt ?? 'Test prompt',
    permissions: (overrides?.permissions ?? []) as never,
    config: (overrides?.config ?? {}) as never,
    is_enabled: overrides?.is_enabled ?? true,
  })
}

describe('pluginExportService', () => {
  let cleanup: () => void

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
  })

  afterEach(() => {
    cleanup()
  })

  describe('serializeAll', () => {
    it('should return empty array when no agents exist', () => {
      const files = pluginExportService.serializeAll()
      expect(files).toEqual([])
    })

    it('should exclude anonymous-agent', () => {
      profilesRepository.create({
        id: ANONYMOUS_AGENT_ID,
        type: 'agent',
        name: 'Anonymous Agent',
      })
      agentsRepository.create({
        id: ANONYMOUS_AGENT_ID,
        name: 'Anonymous Agent',
        description: 'Anon',
        system_prompt: 'anon prompt',
      })
      createTestAgent({ id: 'real-agent' })

      const files = pluginExportService.serializeAll()
      expect(files).toHaveLength(1)
      expect(files[0]!.filename).toBe('real-agent.md')
    })

    it('should fetch agents with a limit greater than the default 100', () => {
      createTestAgent({ id: 'spy-agent' })

      const listSpy = vi.spyOn(agentsRepository, 'list')
      pluginExportService.serializeAll()

      expect(listSpy).toHaveBeenCalledOnce()
      const filters = listSpy.mock.calls[0]![0]
      expect(filters?.limit).toBeGreaterThan(100)
      listSpy.mockRestore()
    })

    it('should sort files by filename', () => {
      createTestAgent({ id: 'beta-agent' })
      createTestAgent({ id: 'alpha-agent' })

      const files = pluginExportService.serializeAll()
      expect(files).toHaveLength(2)
      expect(files[0]!.filename).toBe('alpha-agent.md')
      expect(files[1]!.filename).toBe('beta-agent.md')
    })
  })

  describe('serializeOne', () => {
    it('should return null for nonexistent agent', () => {
      const file = pluginExportService.serializeOne('nonexistent')
      expect(file).toBeNull()
    })

    it('should return null for anonymous-agent', () => {
      profilesRepository.create({
        id: ANONYMOUS_AGENT_ID,
        type: 'agent',
        name: 'Anonymous Agent',
      })
      agentsRepository.create({
        id: ANONYMOUS_AGENT_ID,
        name: 'Anonymous Agent',
        description: 'Anon',
        system_prompt: 'anon prompt',
      })

      const file = pluginExportService.serializeOne(ANONYMOUS_AGENT_ID)
      expect(file).toBeNull()
    })

    it('should produce correct filename', () => {
      createTestAgent({ id: 'triage-agent' })
      const file = pluginExportService.serializeOne('triage-agent')
      expect(file!.filename).toBe('triage-agent.md')
    })
  })

  describe('markdown structure', () => {
    it('should produce valid markdown with YAML frontmatter', () => {
      createTestAgent({
        id: 'test-md',
        system_prompt: 'You are a test agent.',
      })

      const file = pluginExportService.serializeOne('test-md')!
      expect(file.content.startsWith('---\n')).toBe(true)

      const parts = file.content.split('---\n')
      // parts[0] is empty (before first ---), parts[1] is YAML, parts[2] is body
      expect(parts.length).toBeGreaterThanOrEqual(3)

      const frontmatter = yaml.load(parts[1]!) as Record<string, unknown>
      expect(frontmatter.name).toBeDefined()

      const body = parts.slice(2).join('---\n').trim()
      expect(body).toBe('You are a test agent.')
    })
  })

  describe('frontmatter fields', () => {
    it('should include profile fields', () => {
      createTestAgent({
        id: 'profile-test',
        profileName: 'My Test Agent',
        profileDescription: 'Does testing',
        profileAvatar: 'brain',
      })

      const file = pluginExportService.serializeOne('profile-test')!
      const fm = parseFrontmatter(file.content)
      expect(fm.name).toBe('My Test Agent')
      expect(fm.description).toBe('Does testing')
      expect(fm.avatar).toBe('brain')
    })

    it('should include agent fields', () => {
      createTestAgent({
        id: 'agent-fields-test',
        is_enabled: false,
        permissions: [
          { type: 'resource', resource: 'ticket', actions: ['read'], scope: 'global' },
          { type: 'tool', tool: 'mcp__kombuse__*', scope: 'global' },
        ],
      })

      const file = pluginExportService.serializeOne('agent-fields-test')!
      const fm = parseFrontmatter(file.content)
      expect(fm.is_enabled).toBe(false)
      expect(fm.permissions).toHaveLength(2)
      expect(fm.permissions[0].type).toBe('resource')
      expect(fm.permissions[1].tool).toBe('mcp__kombuse__*')
    })

    it('should promote config fields to top level', () => {
      createTestAgent({
        id: 'config-promote-test',
        config: {
          type: 'coder',
          model: 'gpt-4o',
          backend_type: 'claude-code',
          enabled_for_chat: true,
        },
      })

      const file = pluginExportService.serializeOne('config-promote-test')!
      const fm = parseFrontmatter(file.content)
      expect(fm.type).toBe('coder')
      expect(fm.model).toBe('gpt-4o')
      expect(fm.backend_type).toBe('claude-code')
      expect(fm.enabled_for_chat).toBe(true)
    })

    it('should put remaining config in nested config object', () => {
      createTestAgent({
        id: 'config-remaining-test',
        config: {
          type: 'coder',
          model: 'gpt-4o',
          max_tokens: 4096,
          temperature: 0.7,
        },
      })

      const file = pluginExportService.serializeOne('config-remaining-test')!
      const fm = parseFrontmatter(file.content)
      expect(fm.type).toBe('coder')
      expect(fm.model).toBe('gpt-4o')
      expect(fm.config).toEqual({ max_tokens: 4096, temperature: 0.7 })
    })

    it('should omit config when all fields are promoted', () => {
      createTestAgent({
        id: 'config-omit-test',
        config: {
          type: 'kombuse',
          model: 'claude-sonnet-4-5-20250929',
          backend_type: 'claude-code',
          enabled_for_chat: false,
        },
      })

      const file = pluginExportService.serializeOne('config-omit-test')!
      const fm = parseFrontmatter(file.content)
      expect(fm.config).toBeUndefined()
    })

    it('should default type to kombuse when not set', () => {
      createTestAgent({ id: 'default-type-test', config: {} })

      const file = pluginExportService.serializeOne('default-type-test')!
      const fm = parseFrontmatter(file.content)
      expect(fm.type).toBe('kombuse')
    })
  })

  describe('triggers', () => {
    it('should include triggers in frontmatter', () => {
      const agent = createTestAgent({ id: 'trigger-test' })
      agentTriggersRepository.create({
        agent_id: agent.id,
        event_type: 'ticket.created',
        is_enabled: true,
        priority: 10,
      })

      const file = pluginExportService.serializeOne('trigger-test')!
      const fm = parseFrontmatter(file.content)
      expect(fm.triggers).toHaveLength(1)
      expect(fm.triggers[0].event_type).toBe('ticket.created')
      expect(fm.triggers[0].is_enabled).toBe(true)
      expect(fm.triggers[0].priority).toBe(10)
    })

    it('should strip database-internal fields from triggers', () => {
      const agent = createTestAgent({ id: 'trigger-strip-test' })
      agentTriggersRepository.create({
        agent_id: agent.id,
        event_type: 'comment.added',
        priority: 0,
      })

      const file = pluginExportService.serializeOne('trigger-strip-test')!
      const fm = parseFrontmatter(file.content)
      const trigger = fm.triggers[0]
      expect(trigger.id).toBeUndefined()
      expect(trigger.agent_id).toBeUndefined()
      expect(trigger.created_at).toBeUndefined()
      expect(trigger.updated_at).toBeUndefined()
    })

    it('should apply $SELF placeholder for self-referential conditions', () => {
      const agent = createTestAgent({ id: 'self-test' })
      agentTriggersRepository.create({
        agent_id: agent.id,
        event_type: 'mention.created',
        conditions: {
          mention_type: 'profile',
          mentioned_profile_id: 'self-test',
        },
        priority: 0,
      })

      const file = pluginExportService.serializeOne('self-test')!
      const fm = parseFrontmatter(file.content)
      expect(fm.triggers[0].conditions.mentioned_profile_id).toBe('$SELF')
      expect(fm.triggers[0].conditions.mention_type).toBe('profile')
    })

    it('should not apply $SELF to non-matching values', () => {
      const agent = createTestAgent({ id: 'no-self-test' })
      agentTriggersRepository.create({
        agent_id: agent.id,
        event_type: 'mention.created',
        conditions: {
          mention_type: 'profile',
          mentioned_profile_id: 'other-agent',
        },
        priority: 0,
      })

      const file = pluginExportService.serializeOne('no-self-test')!
      const fm = parseFrontmatter(file.content)
      expect(fm.triggers[0].conditions.mentioned_profile_id).toBe('other-agent')
    })

    it('should pass through null conditions', () => {
      const agent = createTestAgent({ id: 'null-cond-test' })
      agentTriggersRepository.create({
        agent_id: agent.id,
        event_type: 'ticket.created',
        priority: 5,
      })

      const file = pluginExportService.serializeOne('null-cond-test')!
      const fm = parseFrontmatter(file.content)
      expect(fm.triggers[0].conditions).toBeNull()
    })
  })

  describe('serializeMany', () => {
    it('should return empty array for empty agent IDs list', () => {
      createTestAgent({ id: 'many-spare' })
      const files = pluginExportService.serializeMany([])
      expect(files).toEqual([])
    })

    it('should return only the requested agents', () => {
      createTestAgent({ id: 'many-a' })
      createTestAgent({ id: 'many-b' })
      createTestAgent({ id: 'many-c' })

      const files = pluginExportService.serializeMany(['many-a', 'many-c'])
      expect(files).toHaveLength(2)
      expect(files.map((f) => f.filename)).toEqual(['many-a.md', 'many-c.md'])
    })

    it('should skip nonexistent agent IDs', () => {
      createTestAgent({ id: 'many-exists' })
      const files = pluginExportService.serializeMany(['many-exists', 'ghost-agent'])
      expect(files).toHaveLength(1)
      expect(files[0]!.filename).toBe('many-exists.md')
    })

    it('should skip anonymous-agent even when explicitly requested', () => {
      profilesRepository.create({ id: ANONYMOUS_AGENT_ID, type: 'agent', name: 'Anon' })
      agentsRepository.create({ id: ANONYMOUS_AGENT_ID, name: 'Anon', description: 'Anon', system_prompt: 'anon' })
      const files = pluginExportService.serializeMany([ANONYMOUS_AGENT_ID])
      expect(files).toEqual([])
    })

    it('should sort results by filename', () => {
      createTestAgent({ id: 'z-agent' })
      createTestAgent({ id: 'a-agent' })
      const files = pluginExportService.serializeMany(['z-agent', 'a-agent'])
      expect(files[0]!.filename).toBe('a-agent.md')
      expect(files[1]!.filename).toBe('z-agent.md')
    })
  })

  describe('writeAgentsToDirectory', () => {
    let tempDir: string

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'agent-export-test-'))
    })

    afterEach(() => {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true })
      }
    })

    it('should write files to disk', () => {
      createTestAgent({ id: 'disk-agent', system_prompt: 'Hello world' })

      const result = pluginExportService.writeAgentsToDirectory(tempDir)
      expect(result.count).toBe(1)
      expect(result.files).toEqual(['disk-agent.md'])
      expect(result.directory).toBe(tempDir)

      const filePath = join(tempDir, 'disk-agent.md')
      expect(existsSync(filePath)).toBe(true)

      const content = readFileSync(filePath, 'utf-8')
      expect(content).toContain('Hello world')
    })

    it('should create directory if it does not exist', () => {
      createTestAgent({ id: 'mkdir-agent' })

      const nestedDir = join(tempDir, 'nested', 'agents')
      const result = pluginExportService.writeAgentsToDirectory(nestedDir)
      expect(result.count).toBe(1)
      expect(existsSync(join(nestedDir, 'mkdir-agent.md'))).toBe(true)
    })

    it('should return empty result when no agents exist', () => {
      const result = pluginExportService.writeAgentsToDirectory(tempDir)
      expect(result.count).toBe(0)
      expect(result.files).toEqual([])
    })

    it('should export only specified agents when agentIds is provided', () => {
      createTestAgent({ id: 'filter-a' })
      createTestAgent({ id: 'filter-b' })
      createTestAgent({ id: 'filter-c' })

      const result = pluginExportService.writeAgentsToDirectory(tempDir, ['filter-a', 'filter-c'])
      expect(result.count).toBe(2)
      expect(result.files).toEqual(['filter-a.md', 'filter-c.md'])
      expect(existsSync(join(tempDir, 'filter-a.md'))).toBe(true)
      expect(existsSync(join(tempDir, 'filter-c.md'))).toBe(true)
      expect(existsSync(join(tempDir, 'filter-b.md'))).toBe(false)
    })

    it('should export all agents when agentIds is undefined', () => {
      createTestAgent({ id: 'all-a' })
      createTestAgent({ id: 'all-b' })

      const result = pluginExportService.writeAgentsToDirectory(tempDir)
      expect(result.count).toBe(2)
    })

    it('should export all agents when agentIds is an empty array', () => {
      createTestAgent({ id: 'empty-a' })
      createTestAgent({ id: 'empty-b' })

      const result = pluginExportService.writeAgentsToDirectory(tempDir, [])
      expect(result.count).toBe(2)
    })
  })

  describe('exportPackage', () => {
    let tempDir: string
    let originalCwd: string

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'plugin-export-test-'))
      originalCwd = process.cwd()
      process.chdir(tempDir)
      projectsRepository.create({ id: 'test-project', name: 'Test Project', owner_id: TEST_USER_ID, local_path: tempDir })
    })

    afterEach(() => {
      process.chdir(originalCwd)
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true })
      }
    })

    it('should generate correct directory structure', async () => {
      createTestAgent({ id: 'pkg-agent', system_prompt: 'Hello' })

      const result = await pluginExportService.exportPackage({
        package_name: 'my-plugin',
        project_id: 'test-project',
      })

      expect(result.package_name).toBe('my-plugin')
      expect(result.agent_count).toBe(1)
      expect(result.files).toContain('manifest.json')
      expect(result.files).toContain('.kombuse-plugin/plugin.json')
      expect(result.files).toContain('agents/pkg-agent.md')

      // Verify files on disk
      const pluginDir = join(tempDir, '.kombuse', 'plugins', 'my-plugin')
      expect(existsSync(join(pluginDir, 'manifest.json'))).toBe(true)
      expect(existsSync(join(pluginDir, '.kombuse-plugin', 'plugin.json'))).toBe(true)
      expect(existsSync(join(pluginDir, 'agents', 'pkg-agent.md'))).toBe(true)

      // Verify manifest.json has correct PkgManifest format
      const pkgManifest = JSON.parse(readFileSync(join(pluginDir, 'manifest.json'), 'utf-8'))
      expect(pkgManifest.name).toBe('my-plugin')
      expect(pkgManifest.version).toBe('1.0.0')
      expect(pkgManifest.type).toBe('plugin')
    })

    it('should generate manifest with correct name', async () => {
      createTestAgent({ id: 'manifest-agent' })

      await pluginExportService.exportPackage({
        package_name: 'test-pack',
        project_id: 'test-project',
      })

      const pluginDir = join(tempDir, '.kombuse', 'plugins', 'test-pack')
      const manifest = JSON.parse(readFileSync(join(pluginDir, '.kombuse-plugin', 'plugin.json'), 'utf-8'))
      expect(manifest.name).toBe('test-pack')
    })

    it('should set kombuse.plugin_system_version to kombuse-plugin-v1', async () => {
      createTestAgent({ id: 'version-agent' })

      await pluginExportService.exportPackage({
        package_name: 'version-test',
        project_id: 'test-project',
      })

      const pluginDir = join(tempDir, '.kombuse', 'plugins', 'version-test')
      const manifest = JSON.parse(readFileSync(join(pluginDir, '.kombuse-plugin', 'plugin.json'), 'utf-8'))
      expect(manifest.kombuse.plugin_system_version).toBe('kombuse-plugin-v1')
    })

    it('should set exported_at as valid ISO 8601', async () => {
      createTestAgent({ id: 'time-agent' })

      await pluginExportService.exportPackage({
        package_name: 'time-test',
        project_id: 'test-project',
      })

      const pluginDir = join(tempDir, '.kombuse', 'plugins', 'time-test')
      const manifest = JSON.parse(readFileSync(join(pluginDir, '.kombuse-plugin', 'plugin.json'), 'utf-8'))
      const date = new Date(manifest.kombuse.exported_at)
      expect(date.toISOString()).toBe(manifest.kombuse.exported_at)
    })

    it('should default version to 1.0.0 when not specified', async () => {
      createTestAgent({ id: 'default-ver-agent' })

      await pluginExportService.exportPackage({
        package_name: 'default-ver',
        project_id: 'test-project',
      })

      const pluginDir = join(tempDir, '.kombuse', 'plugins', 'default-ver')
      const manifest = JSON.parse(readFileSync(join(pluginDir, '.kombuse-plugin', 'plugin.json'), 'utf-8'))
      expect(manifest.version).toBe('1.0.0')
    })

    it('should include description in manifest when provided', async () => {
      createTestAgent({ id: 'desc-agent' })

      await pluginExportService.exportPackage({
        package_name: 'desc-test',
        project_id: 'test-project',
        description: 'A great plugin',
      })

      const pluginDir = join(tempDir, '.kombuse', 'plugins', 'desc-test')
      const manifest = JSON.parse(readFileSync(join(pluginDir, '.kombuse-plugin', 'plugin.json'), 'utf-8'))
      expect(manifest.description).toBe('A great plugin')
    })

    it('should auto-include labels from trigger conditions', async () => {
      const label = labelsRepository.create({
        project_id: 'test-project',
        name: 'Bug',
        color: '#d73a4a',
      })
      const agent = createTestAgent({ id: 'trigger-label-agent' })
      agentTriggersRepository.create({
        agent_id: agent.id,
        event_type: 'label.added',
        conditions: { label_id: label.id },
        priority: 0,
      })

      const result = await pluginExportService.exportPackage({
        package_name: 'label-auto',
        project_id: 'test-project',
      })

      expect(result.label_count).toBe(1)

      const pluginDir = join(tempDir, '.kombuse', 'plugins', 'label-auto')
      const manifest = JSON.parse(readFileSync(join(pluginDir, '.kombuse-plugin', 'plugin.json'), 'utf-8'))
      expect(manifest.kombuse.labels).toHaveLength(1)
      expect(manifest.kombuse.labels[0].name).toBe('Bug')
      expect(manifest.kombuse.labels[0].color).toBe('#d73a4a')
    })

    it('should include all project labels in manifest', async () => {
      labelsRepository.create({
        project_id: 'test-project',
        name: 'Enhancement',
        color: '#7057ff',
      })
      labelsRepository.create({
        project_id: 'test-project',
        name: 'Bug',
        color: '#d73a4a',
      })
      createTestAgent({ id: 'all-labels-agent' })

      const result = await pluginExportService.exportPackage({
        package_name: 'all-labels',
        project_id: 'test-project',
      })

      expect(result.label_count).toBe(2)

      const pluginDir = join(tempDir, '.kombuse', 'plugins', 'all-labels')
      const manifest = JSON.parse(readFileSync(join(pluginDir, '.kombuse-plugin', 'plugin.json'), 'utf-8'))
      expect(manifest.kombuse.labels).toHaveLength(2)
      const labelNames = manifest.kombuse.labels.map((l: { name: string }) => l.name).sort()
      expect(labelNames).toEqual(['Bug', 'Enhancement'])
    })

    it('should not include labels from other projects', async () => {
      projectsRepository.create({ id: 'other-project', name: 'Other', owner_id: TEST_USER_ID })
      labelsRepository.create({
        project_id: 'test-project',
        name: 'Ours',
        color: '#00ff00',
      })
      labelsRepository.create({
        project_id: 'other-project',
        name: 'Theirs',
        color: '#ff0000',
      })
      createTestAgent({ id: 'cross-proj-agent' })

      const result = await pluginExportService.exportPackage({
        package_name: 'cross-proj',
        project_id: 'test-project',
      })

      expect(result.label_count).toBe(1)

      const pluginDir = join(tempDir, '.kombuse', 'plugins', 'cross-proj')
      const manifest = JSON.parse(readFileSync(join(pluginDir, '.kombuse-plugin', 'plugin.json'), 'utf-8'))
      expect(manifest.kombuse.labels).toHaveLength(1)
      expect(manifest.kombuse.labels[0].name).toBe('Ours')
    })

    it('should replace label_id with label_name in agent files', async () => {
      const label = labelsRepository.create({
        project_id: 'test-project',
        name: 'Cook it',
        color: '#ec4899',
      })
      const agent = createTestAgent({ id: 'label-replace-agent' })
      agentTriggersRepository.create({
        agent_id: agent.id,
        event_type: 'label.added',
        conditions: { label_id: label.id },
        priority: 0,
      })

      await pluginExportService.exportPackage({
        package_name: 'label-replace',
        project_id: 'test-project',
      })

      const pluginDir = join(tempDir, '.kombuse', 'plugins', 'label-replace')
      const agentContent = readFileSync(join(pluginDir, 'agents', 'label-replace-agent.md'), 'utf-8')
      expect(agentContent).toContain('label_name: "Cook it"')
      expect(agentContent).not.toContain(`label_id: ${label.id}`)
    })

    it('should throw for invalid package name with spaces', async () => {
      await expect(
        pluginExportService.exportPackage({
          package_name: 'my plugin',
          project_id: 'test-project',
        })
      ).rejects.toThrow(/Invalid package name/)
    })

    it('should throw for invalid package name with uppercase', async () => {
      await expect(
        pluginExportService.exportPackage({
          package_name: 'MyPlugin',
          project_id: 'test-project',
        })
      ).rejects.toThrow(/Invalid package name/)
    })

    it('should throw for invalid package name with special chars', async () => {
      await expect(
        pluginExportService.exportPackage({
          package_name: 'my_plugin!',
          project_id: 'test-project',
        })
      ).rejects.toThrow(/Invalid package name/)
    })

    it('should generate manifest even with no agents', async () => {
      const result = await pluginExportService.exportPackage({
        package_name: 'empty-pkg',
        project_id: 'test-project',
      })

      expect(result.agent_count).toBe(0)
      expect(result.files).toContain('.kombuse-plugin/plugin.json')

      const pluginDir = join(tempDir, '.kombuse', 'plugins', 'empty-pkg')
      expect(existsSync(join(pluginDir, '.kombuse-plugin', 'plugin.json'))).toBe(true)
    })

    it('should throw PackageExistsError when directory exists without overwrite', async () => {
      createTestAgent({ id: 'exists-agent' })

      await pluginExportService.exportPackage({
        package_name: 'exists-test',
        project_id: 'test-project',
      })

      await expect(
        pluginExportService.exportPackage({
          package_name: 'exists-test',
          project_id: 'test-project',
        })
      ).rejects.toThrow(PackageExistsError)
    })

    it('should succeed when directory exists with overwrite: true', async () => {
      createTestAgent({ id: 'overwrite-agent' })

      await pluginExportService.exportPackage({
        package_name: 'overwrite-test',
        project_id: 'test-project',
      })

      const result = await pluginExportService.exportPackage({
        package_name: 'overwrite-test',
        project_id: 'test-project',
        overwrite: true,
      })

      expect(result.agent_count).toBe(1)
    })

    it('should produce archive when archive_format is tar.gz', async () => {
      createTestAgent({ id: 'archive-agent', system_prompt: 'Archive me' })

      const result = await pluginExportService.exportPackage({
        package_name: 'archive-test',
        project_id: 'test-project',
        archive_format: 'tar.gz',
        overwrite: true,
      })

      expect(result.archive).toBeDefined()
      expect(result.archive!.path).toMatch(/\.tar\.gz$/)
      expect(result.archive!.checksum).toMatch(/^[0-9a-f]{64}$/)
      expect(result.archive!.size).toBeGreaterThan(0)
      expect(existsSync(result.archive!.path)).toBe(true)
    })

    it('should not include archive when archive_format is not set', async () => {
      createTestAgent({ id: 'no-archive-agent' })

      const result = await pluginExportService.exportPackage({
        package_name: 'no-archive-test',
        project_id: 'test-project',
        overwrite: true,
      })

      expect(result.archive).toBeUndefined()
    })

  })
})

function parseFrontmatter(content: string): Record<string, any> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) throw new Error('No frontmatter found')
  return yaml.load(match[1]!) as Record<string, any>
}
