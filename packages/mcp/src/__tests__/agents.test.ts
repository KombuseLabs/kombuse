import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { setupTestDb } from '@kombuse/persistence/test-utils'
import { profilesRepository, agentsRepository, agentTriggersRepository, agentInvocationsRepository } from '@kombuse/persistence'
import type { Permission, Agent } from '@kombuse/types'
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
    agentsRepository.create({ id: 'agent-1', system_prompt: 'Prompt 1' })
    agentsRepository.create({ id: 'agent-2', system_prompt: 'Prompt 2' })

    const result = await client.callTool({ name: 'list_agents', arguments: {} })
    const data = parseContent(result) as { agents: Agent[]; count: number }

    expect(data.count).toBe(2)
  })

  it('should filter by is_enabled', async () => {
    createAgentProfile('agent-enabled', 'Enabled')
    createAgentProfile('agent-disabled', 'Disabled')
    agentsRepository.create({ id: 'agent-enabled', system_prompt: 'Prompt', is_enabled: true })
    agentsRepository.create({ id: 'agent-disabled', system_prompt: 'Prompt', is_enabled: false })

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
      agentsRepository.create({ id: `agent-${i}`, system_prompt: `Prompt ${i}` })
    }

    const result = await client.callTool({
      name: 'list_agents',
      arguments: { limit: 2, offset: 1 },
    })
    const data = parseContent(result) as { agents: Agent[]; count: number }

    expect(data.count).toBe(2)
  })
})

describe('create_agent', () => {
  it('should create an agent with required fields', async () => {
    createAgentProfile('new-agent', 'New Agent')

    const result = await client.callTool({
      name: 'create_agent',
      arguments: {
        id: 'new-agent',
        system_prompt: 'You are a helpful agent.',
      },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as Agent

    expect(data.id).toBe('new-agent')
    expect(data.system_prompt).toBe('You are a helpful agent.')
    expect(data.is_enabled).toBe(true)
  })

  it('should create an agent with all optional fields', async () => {
    createAgentProfile('full-agent', 'Full Agent')

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
        id: 'full-agent',
        system_prompt: 'Full agent prompt',
        permissions,
        config,
        is_enabled: false,
      },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as Agent

    expect(data.permissions).toEqual(permissions)
    expect(data.config.model).toBe('claude-sonnet-4-5-20250929')
    expect(data.is_enabled).toBe(false)
  })

  it('should auto-create profile when it does not exist', async () => {
    const result = await client.callTool({
      name: 'create_agent',
      arguments: {
        id: 'auto-profile-agent',
        system_prompt: 'Auto-created agent',
      },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as Agent
    expect(data.id).toBe('auto-profile-agent')
    expect(data.system_prompt).toBe('Auto-created agent')

    // Verify profile was auto-created
    const profile = profilesRepository.get('auto-profile-agent')
    expect(profile).toBeDefined()
    expect(profile!.type).toBe('agent')
    expect(profile!.name).toBe('auto-profile-agent')
  })

  it('should return error when profile is not type agent', async () => {
    profilesRepository.create({ id: 'user-profile', type: 'user', name: 'User' })

    const result = await client.callTool({
      name: 'create_agent',
      arguments: {
        id: 'user-profile',
        system_prompt: 'Prompt',
      },
    })

    expect(result.isError).toBe(true)
  })
})

describe('update_agent', () => {
  it('should update system_prompt', async () => {
    createAgentProfile('upd-agent', 'Update Agent')
    agentsRepository.create({ id: 'upd-agent', system_prompt: 'Old prompt' })

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
    agentsRepository.create({ id: 'toggle-agent', system_prompt: 'Prompt', is_enabled: true })

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
    agentsRepository.create({ id: 'perm-agent', system_prompt: 'Prompt' })

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
    agentsRepository.create({ id, system_prompt: 'Test agent', permissions })

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

  it('should allow non-agent callers (no kombuse_session_id) freely', async () => {
    createAgentProfile('free-agent', 'Free Agent')

    const result = await client.callTool({
      name: 'create_agent',
      arguments: {
        id: 'free-agent',
        system_prompt: 'Prompt',
      },
    })

    expect(result.isError).toBeFalsy()
  })

  it('should deny agents with empty permissions from creating agents', async () => {
    const sessionId = createTestAgentSession([])
    createAgentProfile('target-agent', 'Target')

    const result = await client.callTool({
      name: 'create_agent',
      arguments: {
        id: 'target-agent',
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
    createAgentProfile('allowed-agent', 'Allowed')

    const result = await client.callTool({
      name: 'create_agent',
      arguments: {
        id: 'allowed-agent',
        system_prompt: 'Prompt',
        kombuse_session_id: sessionId,
      },
    })

    expect(result.isError).toBeFalsy()
  })

  it('should deny agents with empty permissions from updating agents', async () => {
    createAgentProfile('upd-target', 'Target')
    agentsRepository.create({ id: 'upd-target', system_prompt: 'Old' })

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
    agentsRepository.create({ id: 'upd-allowed', system_prompt: 'Old' })

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
})
