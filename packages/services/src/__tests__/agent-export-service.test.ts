import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as yaml from 'js-yaml'
import {
  setupTestDb,
} from '@kombuse/persistence/test-utils'
import {
  agentsRepository,
  agentTriggersRepository,
  profilesRepository,
} from '@kombuse/persistence'
import { ANONYMOUS_AGENT_ID } from '@kombuse/types'
import { agentExportService } from '../agent-export-service'

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
    system_prompt: overrides?.system_prompt ?? 'Test prompt',
    permissions: (overrides?.permissions ?? []) as never,
    config: (overrides?.config ?? {}) as never,
    is_enabled: overrides?.is_enabled ?? true,
  })
}

describe('agentExportService', () => {
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
      const files = agentExportService.serializeAll()
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
        system_prompt: 'anon prompt',
      })
      createTestAgent({ id: 'real-agent' })

      const files = agentExportService.serializeAll()
      expect(files).toHaveLength(1)
      expect(files[0]!.filename).toBe('real-agent.md')
    })

    it('should fetch agents with a limit greater than the default 100', () => {
      createTestAgent({ id: 'spy-agent' })

      const listSpy = vi.spyOn(agentsRepository, 'list')
      agentExportService.serializeAll()

      expect(listSpy).toHaveBeenCalledOnce()
      const filters = listSpy.mock.calls[0]![0]
      expect(filters?.limit).toBeGreaterThan(100)
      listSpy.mockRestore()
    })

    it('should sort files by filename', () => {
      createTestAgent({ id: 'beta-agent' })
      createTestAgent({ id: 'alpha-agent' })

      const files = agentExportService.serializeAll()
      expect(files).toHaveLength(2)
      expect(files[0]!.filename).toBe('alpha-agent.md')
      expect(files[1]!.filename).toBe('beta-agent.md')
    })
  })

  describe('serializeOne', () => {
    it('should return null for nonexistent agent', () => {
      const file = agentExportService.serializeOne('nonexistent')
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
        system_prompt: 'anon prompt',
      })

      const file = agentExportService.serializeOne(ANONYMOUS_AGENT_ID)
      expect(file).toBeNull()
    })

    it('should produce correct filename', () => {
      createTestAgent({ id: 'triage-agent' })
      const file = agentExportService.serializeOne('triage-agent')
      expect(file!.filename).toBe('triage-agent.md')
    })
  })

  describe('markdown structure', () => {
    it('should produce valid markdown with YAML frontmatter', () => {
      createTestAgent({
        id: 'test-md',
        system_prompt: 'You are a test agent.',
      })

      const file = agentExportService.serializeOne('test-md')!
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

      const file = agentExportService.serializeOne('profile-test')!
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

      const file = agentExportService.serializeOne('agent-fields-test')!
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

      const file = agentExportService.serializeOne('config-promote-test')!
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

      const file = agentExportService.serializeOne('config-remaining-test')!
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

      const file = agentExportService.serializeOne('config-omit-test')!
      const fm = parseFrontmatter(file.content)
      expect(fm.config).toBeUndefined()
    })

    it('should default type to kombuse when not set', () => {
      createTestAgent({ id: 'default-type-test', config: {} })

      const file = agentExportService.serializeOne('default-type-test')!
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

      const file = agentExportService.serializeOne('trigger-test')!
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

      const file = agentExportService.serializeOne('trigger-strip-test')!
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

      const file = agentExportService.serializeOne('self-test')!
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

      const file = agentExportService.serializeOne('no-self-test')!
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

      const file = agentExportService.serializeOne('null-cond-test')!
      const fm = parseFrontmatter(file.content)
      expect(fm.triggers[0].conditions).toBeNull()
    })
  })

  describe('serializeMany', () => {
    it('should return empty array for empty agent IDs list', () => {
      createTestAgent({ id: 'many-spare' })
      const files = agentExportService.serializeMany([])
      expect(files).toEqual([])
    })

    it('should return only the requested agents', () => {
      createTestAgent({ id: 'many-a' })
      createTestAgent({ id: 'many-b' })
      createTestAgent({ id: 'many-c' })

      const files = agentExportService.serializeMany(['many-a', 'many-c'])
      expect(files).toHaveLength(2)
      expect(files.map((f) => f.filename)).toEqual(['many-a.md', 'many-c.md'])
    })

    it('should skip nonexistent agent IDs', () => {
      createTestAgent({ id: 'many-exists' })
      const files = agentExportService.serializeMany(['many-exists', 'ghost-agent'])
      expect(files).toHaveLength(1)
      expect(files[0]!.filename).toBe('many-exists.md')
    })

    it('should skip anonymous-agent even when explicitly requested', () => {
      profilesRepository.create({ id: ANONYMOUS_AGENT_ID, type: 'agent', name: 'Anon' })
      agentsRepository.create({ id: ANONYMOUS_AGENT_ID, system_prompt: 'anon' })
      const files = agentExportService.serializeMany([ANONYMOUS_AGENT_ID])
      expect(files).toEqual([])
    })

    it('should sort results by filename', () => {
      createTestAgent({ id: 'z-agent' })
      createTestAgent({ id: 'a-agent' })
      const files = agentExportService.serializeMany(['z-agent', 'a-agent'])
      expect(files[0]!.filename).toBe('a-agent.md')
      expect(files[1]!.filename).toBe('z-agent.md')
    })
  })

  describe('writeToDirectory', () => {
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

      const result = agentExportService.writeToDirectory(tempDir)
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
      const result = agentExportService.writeToDirectory(nestedDir)
      expect(result.count).toBe(1)
      expect(existsSync(join(nestedDir, 'mkdir-agent.md'))).toBe(true)
    })

    it('should return empty result when no agents exist', () => {
      const result = agentExportService.writeToDirectory(tempDir)
      expect(result.count).toBe(0)
      expect(result.files).toEqual([])
    })

    it('should export only specified agents when agentIds is provided', () => {
      createTestAgent({ id: 'filter-a' })
      createTestAgent({ id: 'filter-b' })
      createTestAgent({ id: 'filter-c' })

      const result = agentExportService.writeToDirectory(tempDir, ['filter-a', 'filter-c'])
      expect(result.count).toBe(2)
      expect(result.files).toEqual(['filter-a.md', 'filter-c.md'])
      expect(existsSync(join(tempDir, 'filter-a.md'))).toBe(true)
      expect(existsSync(join(tempDir, 'filter-c.md'))).toBe(true)
      expect(existsSync(join(tempDir, 'filter-b.md'))).toBe(false)
    })

    it('should export all agents when agentIds is undefined', () => {
      createTestAgent({ id: 'all-a' })
      createTestAgent({ id: 'all-b' })

      const result = agentExportService.writeToDirectory(tempDir)
      expect(result.count).toBe(2)
    })

    it('should export all agents when agentIds is an empty array', () => {
      createTestAgent({ id: 'empty-a' })
      createTestAgent({ id: 'empty-b' })

      const result = agentExportService.writeToDirectory(tempDir, [])
      expect(result.count).toBe(2)
    })
  })
})

function parseFrontmatter(content: string): Record<string, any> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) throw new Error('No frontmatter found')
  return yaml.load(match[1]!) as Record<string, any>
}
