import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { setupTestDb } from '@kombuse/persistence/test-utils'
import { profilesRepository, agentsRepository, agentTriggersRepository, agentInvocationsRepository, profileSettingsRepository } from '@kombuse/persistence'
import type { Permission, Agent } from '@kombuse/types'
import { MCP_ANONYMOUS_WRITE_ACCESS_SETTING_KEY, DEFAULT_PREFERENCE_PROFILE_ID } from '@kombuse/services'
import { registerAgentTools } from '../index'

let cleanup: () => void
let client: Client

async function setupTestClient() {
  const server = new McpServer({ name: 'test', version: '0.0.1' })
  registerAgentTools(server)

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.server.connect(serverTransport)

  const c = new Client({ name: 'test-client', version: '0.0.1' })
  await c.connect(clientTransport)

  return c
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseContent(result: any): unknown {
  const textBlock = result.content[0] as { type: string; text: string }
  return JSON.parse(textBlock.text)
}

function createAgentProfile(id: string, name: string) {
  profilesRepository.create({ id, type: 'agent', name })
}

function allowAnonymousWrites() {
  if (!profilesRepository.get(DEFAULT_PREFERENCE_PROFILE_ID)) {
    profilesRepository.create({ id: DEFAULT_PREFERENCE_PROFILE_ID, type: 'user', name: 'Default User' })
  }
  profileSettingsRepository.upsert({
    profile_id: DEFAULT_PREFERENCE_PROFILE_ID,
    setting_key: MCP_ANONYMOUS_WRITE_ACCESS_SETTING_KEY,
    setting_value: 'allowed',
  })
}

beforeEach(async () => {
  const setup = setupTestDb()
  cleanup = setup.cleanup
  client = await setupTestClient()
})

afterEach(() => {
  cleanup()
})

describe('list_agents', () => {
  it('should return empty array when no agents exist', async () => {
    const result = await client.callTool({ name: 'list_agents', arguments: {} })
    const data = parseContent(result) as { agents: unknown[]; count: number }

    expect(data.agents).toEqual([])
    expect(data.count).toBe(0)
  })

  it('should return all agents', async () => {
    createAgentProfile('agent-1', 'Agent One')
    createAgentProfile('agent-2', 'Agent Two')
    agentsRepository.create({ id: 'agent-1', name: 'Test Agent', description: 'Test', system_prompt: 'Prompt 1' })
    agentsRepository.create({ id: 'agent-2', name: 'Test Agent', description: 'Test', system_prompt: 'Prompt 2' })

    const result = await client.callTool({ name: 'list_agents', arguments: {} })
    const data = parseContent(result) as { agents: Agent[]; count: number }

    expect(data.count).toBe(2)
  })

  it('should filter by is_enabled', async () => {
    createAgentProfile('agent-enabled', 'Enabled')
    createAgentProfile('agent-disabled', 'Disabled')
    agentsRepository.create({ id: 'agent-enabled', name: 'Test Agent', description: 'Test', system_prompt: 'Prompt', is_enabled: true })
    agentsRepository.create({ id: 'agent-disabled', name: 'Test Agent', description: 'Test', system_prompt: 'Prompt', is_enabled: false })

    const result = await client.callTool({
      name: 'list_agents',
      arguments: { is_enabled: true },
    })
    const data = parseContent(result) as { agents: Agent[]; count: number }

    expect(data.count).toBe(1)
    expect(data.agents[0]!.id).toBe('agent-enabled')
  })

  it('should respect limit and offset', async () => {
    for (let i = 1; i <= 5; i++) {
      createAgentProfile(`agent-${i}`, `Agent ${i}`)
      agentsRepository.create({ id: `agent-${i}`, name: 'Test Agent', description: 'Test', system_prompt: `Prompt ${i}` })
    }

    const result = await client.callTool({
      name: 'list_agents',
      arguments: { limit: 2, offset: 1 },
    })
    const data = parseContent(result) as { agents: Agent[]; count: number }

    expect(data.count).toBe(2)
  })
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('create_agent', () => {
  beforeEach(() => { allowAnonymousWrites() })

  it('should create an agent with required fields', async () => {
    const result = await client.callTool({
      name: 'create_agent',
      arguments: {
        name: 'New Agent',
        description: 'A helpful agent',
        system_prompt: 'You are a helpful agent.',
      },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as Agent

    expect(data.id).toMatch(UUID_RE)
    expect(data.system_prompt).toBe('You are a helpful agent.')
    expect(data.is_enabled).toBe(true)
  })

  it('should create an agent with all optional fields', async () => {
    const permissions: Permission[] = [
      {
        type: 'resource',
        resource: 'ticket',
        actions: ['read', 'create'],
        scope: 'global',
      },
    ]
    const config = { model: 'claude-sonnet-4-5-20250929', max_tokens: 4096 }

    const result = await client.callTool({
      name: 'create_agent',
      arguments: {
        name: 'Full Agent',
        description: 'Full agent',
        system_prompt: 'Full agent prompt',
        permissions,
        config,
        is_enabled: false,
      },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as Agent

    expect(data.id).toMatch(UUID_RE)
    expect(data.permissions).toEqual(permissions)
    expect(data.config.model).toBe('claude-sonnet-4-5-20250929')
    expect(data.is_enabled).toBe(false)
  })

  it('should accept config.backend_type on create_agent', async () => {
    const result = await client.callTool({
      name: 'create_agent',
      arguments: {
        name: 'Backend Agent',
        description: 'Backend-aware agent',
        system_prompt: 'Backend-aware agent',
        config: {
          backend_type: 'codex',
          model: 'gpt-4.1',
        },
      },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as Agent
    expect(data.config.backend_type).toBe('codex')
  })

  it('should auto-create profile when it does not exist', async () => {
    const result = await client.callTool({
      name: 'create_agent',
      arguments: {
        name: 'Auto Profile Agent',
        description: 'Auto-created agent',
        system_prompt: 'Auto-created agent',
      },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as Agent
    expect(data.id).toMatch(UUID_RE)
    expect(data.system_prompt).toBe('Auto-created agent')

    // Verify profile was auto-created
    const profile = profilesRepository.get(data.id)
    expect(profile).toBeDefined()
    expect(profile!.type).toBe('agent')
    expect(profile!.name).toBe('Auto Profile Agent')
  })

  it('should return error when profile is not type agent', async () => {
    const userId = crypto.randomUUID()
    profilesRepository.create({ id: userId, type: 'user', name: 'User' })

    const result = await client.callTool({
      name: 'create_agent',
      arguments: {
        id: userId,
        name: 'Bad Agent',
        description: 'Test',
        system_prompt: 'Prompt',
      },
    })

    expect(result.isError).toBe(true)
  })

  it('should auto-generate UUID when id is not provided', async () => {
    const result = await client.callTool({
      name: 'create_agent',
      arguments: {
        name: 'UUID Agent',
        description: 'Tests UUID generation',
        system_prompt: 'Test prompt',
      },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as Agent
    expect(data.id).toMatch(UUID_RE)

    const agent = agentsRepository.get(data.id)
    expect(agent).toBeDefined()
    expect(agent!.id).toBe(data.id)
  })

  it('should reject non-UUID id', async () => {
    const result = await client.callTool({
      name: 'create_agent',
      arguments: {
        id: 'not-a-uuid',
        name: 'Bad ID Agent',
        description: 'Test',
        system_prompt: 'Test prompt',
      },
    })

    expect(result.isError).toBe(true)
  })
})

describe('update_agent', () => {
  beforeEach(() => { allowAnonymousWrites() })

  it('should update system_prompt', async () => {
    createAgentProfile('upd-agent', 'Update Agent')
    agentsRepository.create({ id: 'upd-agent', name: 'Test Agent', description: 'Test', system_prompt: 'Old prompt' })

    const result = await client.callTool({
      name: 'update_agent',
      arguments: {
        agent_id: 'upd-agent',
        system_prompt: 'New prompt',
      },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as Agent
    expect(data.system_prompt).toBe('New prompt')
  })

  it('should update is_enabled', async () => {
    createAgentProfile('toggle-agent', 'Toggle Agent')
    agentsRepository.create({ id: 'toggle-agent', name: 'Test Agent', description: 'Test', system_prompt: 'Prompt', is_enabled: true })

    const result = await client.callTool({
      name: 'update_agent',
      arguments: {
        agent_id: 'toggle-agent',
        is_enabled: false,
      },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as Agent
    expect(data.is_enabled).toBe(false)
  })

  it('should update permissions', async () => {
    createAgentProfile('perm-agent', 'Perm Agent')
    agentsRepository.create({ id: 'perm-agent', name: 'Test Agent', description: 'Test', system_prompt: 'Prompt' })

    const newPermissions: Permission[] = [
      {
        type: 'tool',
        tool: 'mcp__kombuse__*',
        scope: 'global',
      },
    ]

    const result = await client.callTool({
      name: 'update_agent',
      arguments: {
        agent_id: 'perm-agent',
        permissions: newPermissions,
      },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as Agent
    expect(data.permissions).toEqual(newPermissions)
  })

  it('should accept config.backend_type on update_agent', async () => {
    createAgentProfile('backend-update-agent', 'Backend Update Agent')
    agentsRepository.create({ id: 'backend-update-agent', name: 'Test Agent', description: 'Test', system_prompt: 'Prompt' })

    const result = await client.callTool({
      name: 'update_agent',
      arguments: {
        agent_id: 'backend-update-agent',
        config: {
          backend_type: 'claude-code',
        },
      },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as Agent
    expect(data.config.backend_type).toBe('claude-code')
  })

  it('should return error when agent does not exist', async () => {
    const result = await client.callTool({
      name: 'update_agent',
      arguments: {
        agent_id: 'nonexistent',
        system_prompt: 'New prompt',
      },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toBeDefined()
  })
})

describe('permission enforcement', () => {
  let agentCounter = 0

  function createTestAgentSession(permissions: Permission[]): string {
    const id = `test-agent-${++agentCounter}-${Date.now()}`
    const sessionId = `session-${id}`

    profilesRepository.create({ id, type: 'agent', name: `Agent ${agentCounter}` })
    agentsRepository.create({ id, name: 'Test Agent', description: 'Test', system_prompt: 'Test agent', permissions })

    const trigger = agentTriggersRepository.create({
      agent_id: id,
      event_type: 'ticket.created',
    })
    const invocation = agentInvocationsRepository.create({
      agent_id: id,
      trigger_id: trigger.id,
      context: {},
    })
    agentInvocationsRepository.update(invocation.id, { kombuse_session_id: sessionId })

    return sessionId
  }

  it('should deny non-agent callers by default (no anonymous write opt-in)', async () => {
    const result = await client.callTool({
      name: 'create_agent',
      arguments: {
        name: 'Free Agent',
        description: 'Test',
        system_prompt: 'Prompt',
      },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('Permission denied')
  })

  it('should deny agents with empty permissions from creating agents', async () => {
    const sessionId = createTestAgentSession([])

    const result = await client.callTool({
      name: 'create_agent',
      arguments: {
        name: 'Target Agent',
        description: 'Test',
        system_prompt: 'Prompt',
        kombuse_session_id: sessionId,
      },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('Permission denied')
  })

  it('should allow agents with agent resource permissions to create', async () => {
    const sessionId = createTestAgentSession([
      { type: 'resource', resource: 'agent', actions: ['create'], scope: 'global' },
    ])

    const result = await client.callTool({
      name: 'create_agent',
      arguments: {
        name: 'Allowed Agent',
        description: 'Test',
        system_prompt: 'Prompt',
        kombuse_session_id: sessionId,
      },
    })

    expect(result.isError).toBeFalsy()
  })

  it('should deny agents with empty permissions from updating agents', async () => {
    createAgentProfile('upd-target', 'Target')
    agentsRepository.create({ id: 'upd-target', name: 'Test Agent', description: 'Test', system_prompt: 'Old' })

    const sessionId = createTestAgentSession([])

    const result = await client.callTool({
      name: 'update_agent',
      arguments: {
        agent_id: 'upd-target',
        system_prompt: 'New',
        kombuse_session_id: sessionId,
      },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('Permission denied')
  })

  it('should allow agents with agent update permissions', async () => {
    createAgentProfile('upd-allowed', 'Allowed')
    agentsRepository.create({ id: 'upd-allowed', name: 'Test Agent', description: 'Test', system_prompt: 'Old' })

    const sessionId = createTestAgentSession([
      { type: 'resource', resource: 'agent', actions: ['update'], scope: 'global' },
    ])

    const result = await client.callTool({
      name: 'update_agent',
      arguments: {
        agent_id: 'upd-allowed',
        system_prompt: 'New',
        kombuse_session_id: sessionId,
      },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as Agent
    expect(data.system_prompt).toBe('New')
  })

  // -- anonymous write access setting --

  it('should deny anonymous create_agent when anonymous write access is denied', async () => {
    if (!profilesRepository.get(DEFAULT_PREFERENCE_PROFILE_ID)) {
      profilesRepository.create({ id: DEFAULT_PREFERENCE_PROFILE_ID, type: 'user', name: 'Default User' })
    }
    profileSettingsRepository.upsert({
      profile_id: DEFAULT_PREFERENCE_PROFILE_ID,
      setting_key: MCP_ANONYMOUS_WRITE_ACCESS_SETTING_KEY,
      setting_value: 'denied',
    })

    const result = await client.callTool({
      name: 'create_agent',
      arguments: {
        name: 'Test Agent',
        description: 'Test',
        system_prompt: 'Test prompt',
      },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('Permission denied')
  })

  it('should deny anonymous update_agent when anonymous write access is denied', async () => {
    createAgentProfile('anon-upd-target', 'Target')
    agentsRepository.create({ id: 'anon-upd-target', name: 'Test Agent', description: 'Test', system_prompt: 'Old' })

    if (!profilesRepository.get(DEFAULT_PREFERENCE_PROFILE_ID)) {
      profilesRepository.create({ id: DEFAULT_PREFERENCE_PROFILE_ID, type: 'user', name: 'Default User' })
    }
    profileSettingsRepository.upsert({
      profile_id: DEFAULT_PREFERENCE_PROFILE_ID,
      setting_key: MCP_ANONYMOUS_WRITE_ACCESS_SETTING_KEY,
      setting_value: 'denied',
    })

    const result = await client.callTool({
      name: 'update_agent',
      arguments: {
        agent_id: 'anon-upd-target',
        system_prompt: 'Should fail',
      },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('Permission denied')
  })
})
