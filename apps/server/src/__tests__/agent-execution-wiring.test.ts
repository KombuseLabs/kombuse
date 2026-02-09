import { describe, it, expect, vi } from 'vitest'
import type { AgentBackend, AgentEvent, KombuseSessionId, StartOptions } from '@kombuse/types'

// Mock side-effect imports before importing the module under test
vi.mock('../websocket/hub', () => ({
  wsHub: {
    broadcastToTopic: vi.fn(),
    broadcastAgentMessage: vi.fn(),
  },
}))

vi.mock('../websocket/serialize-agent-event', () => ({
  serializeAgentStreamEvent: vi.fn(),
}))

vi.mock('../logger', () => ({
  createSessionLogger: vi.fn(() => ({
    logEvent: vi.fn(),
    info: vi.fn(),
    close: vi.fn(),
  })),
}))

vi.mock('@kombuse/persistence', () => ({
  agentInvocationsRepository: {
    list: vi.fn(() => []),
  },
  eventsRepository: {
    create: vi.fn(),
  },
  sessionsRepository: {},
}))

import { agentInvocationsRepository } from '@kombuse/persistence'
import {
  startAgentChatSession,
  presetToAllowedTools,
  getTypePreset,
} from '../services/agent-execution-service'

/** Wait for async work fired by startAgentChatSession (which is sync but spawns async). */
async function waitForBackendStart(backend: AgentBackend): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if ((backend.start as ReturnType<typeof vi.fn>).mock.calls.length > 0) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('backend.start() was not called within timeout')
}

describe('startAgentChatSession allowedTools wiring', () => {
  it('passes preset allowedTools through to backend.start()', async () => {
    let capturedOptions: StartOptions | undefined

    const mockBackend: AgentBackend = {
      name: 'claude-code' as const,
      start: vi.fn(async (options: StartOptions) => {
        capturedOptions = options
      }),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      isRunning: vi.fn(() => true),
      getBackendSessionId: vi.fn(() => undefined),
    }

    const mockDependencies = {
      getAgent: vi.fn(() => ({
        id: 'test-agent',
        name: 'Test Agent',
        system_prompt: '',
        is_enabled: true,
        config: { type: 'kombuse' },
        permissions: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
      processEvent: vi.fn(() => []),
      createBackend: vi.fn(() => mockBackend),
      generateSessionId: vi.fn(() => 'chat-test-id' as KombuseSessionId),
      resolveProjectPath: vi.fn(() => '/tmp'),
      sessionPersistence: {
        ensureSession: vi.fn(() => 'session-1'),
        getSession: vi.fn(() => null),
        markSessionRunning: vi.fn(),
        persistEvent: vi.fn(),
        completeSession: vi.fn(),
        failSession: vi.fn(),
        getSessionByKombuseId: vi.fn(() => null),
        getSessionEvents: vi.fn(() => []),
      },
    }

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'hello',
        kombuseSessionId: 'chat-test-id' as KombuseSessionId,
      },
      () => {},
      mockDependencies as any,
    )

    await waitForBackendStart(mockBackend)

    const expectedTools = presetToAllowedTools(getTypePreset('kombuse'))
    expect(capturedOptions?.allowedTools, 'allowedTools should be wired from preset to backend.start()').toEqual(expectedTools)
  })
})

describe('startAgentChatSession agent resolution from session context', () => {
  function createMockBackend() {
    let capturedOptions: StartOptions | undefined
    const backend: AgentBackend = {
      name: 'claude-code' as const,
      start: vi.fn(async (options: StartOptions) => {
        capturedOptions = options
      }),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      isRunning: vi.fn(() => true),
      getBackendSessionId: vi.fn(() => undefined),
    }
    return { backend, getCapturedOptions: () => capturedOptions }
  }

  function createMockDependencies(
    backend: AgentBackend,
    agents: Record<string, unknown>,
  ) {
    return {
      getAgent: vi.fn((id: string) => agents[id] ?? null),
      processEvent: vi.fn(() => []),
      createBackend: vi.fn(() => backend),
      generateSessionId: vi.fn(() => 'chat-test-id' as KombuseSessionId),
      resolveProjectPath: vi.fn(() => '/tmp'),
      sessionPersistence: {
        ensureSession: vi.fn(() => 'session-1'),
        getSession: vi.fn(() => null),
        markSessionRunning: vi.fn(),
        persistEvent: vi.fn(),
        completeSession: vi.fn(),
        failSession: vi.fn(),
        getSessionByKombuseId: vi.fn(() => null),
        getSessionEvents: vi.fn(() => []),
      },
    }
  }

  const mockInvocation = {
    id: 1,
    agent_id: 'ticket-analyzer',
    trigger_id: 1,
    event_id: null,
    session_id: null,
    kombuse_session_id: 'trigger-session-abc',
    status: 'completed' as const,
    attempts: 1,
    max_attempts: 3,
    run_at: new Date().toISOString(),
    context: {},
    result: null,
    error: null,
    started_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
  }

  const coderAgent = {
    id: 'ticket-analyzer',
    name: 'Ticket Analyzer',
    system_prompt: '',
    is_enabled: true,
    config: { type: 'coder' },
    permissions: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  it('resolves agent from invocation when agentId is not provided', async () => {
    ;(agentInvocationsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([mockInvocation])

    const { backend, getCapturedOptions } = createMockBackend()
    const deps = createMockDependencies(backend, { 'ticket-analyzer': coderAgent })

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'please fix the tests',
        kombuseSessionId: 'trigger-session-abc',
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    expect(deps.getAgent).toHaveBeenCalledWith('ticket-analyzer')

    const expectedTools = presetToAllowedTools(getTypePreset('coder'))
    expect(
      getCapturedOptions()?.allowedTools,
      'should use coder preset tools, not default kombuse'
    ).toEqual(expectedTools)

    expect(
      getCapturedOptions()?.systemPrompt,
      'should render preamble for resumed session'
    ).toBeDefined()
  })

  it('falls back to default when no invocations found for session', async () => {
    ;(agentInvocationsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([])

    const { backend, getCapturedOptions } = createMockBackend()
    const deps = createMockDependencies(backend, {})

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'hello',
        kombuseSessionId: 'unknown-session',
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    expect(
      getCapturedOptions()?.systemPrompt,
      'should have no system prompt when agent cannot be resolved'
    ).toBeUndefined()
  })

  it('uses the first invocation when multiple exist for the same session', async () => {
    const olderInvocation = { ...mockInvocation, id: 2, agent_id: 'other-agent' }
    const olderAgent = { ...coderAgent, id: 'other-agent', config: { type: 'kombuse' } }

    // list() returns ORDER BY created_at DESC, so mockInvocation (most recent) is first
    ;(agentInvocationsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([
      mockInvocation,
      olderInvocation,
    ])

    const { backend, getCapturedOptions } = createMockBackend()
    const deps = createMockDependencies(backend, {
      'ticket-analyzer': coderAgent,
      'other-agent': olderAgent,
    })

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'hello',
        kombuseSessionId: 'trigger-session-abc',
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    // Should resolve to ticket-analyzer (first/most recent), not other-agent
    expect(deps.getAgent).toHaveBeenCalledWith('ticket-analyzer')

    const expectedTools = presetToAllowedTools(getTypePreset('coder'))
    expect(
      getCapturedOptions()?.allowedTools,
      'should use coder preset from most recent invocation'
    ).toEqual(expectedTools)
  })

  it('does not use disabled agent from invocation lookup', async () => {
    ;(agentInvocationsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([mockInvocation])

    const disabledAgent = { ...coderAgent, is_enabled: false }
    const { backend, getCapturedOptions } = createMockBackend()
    const deps = createMockDependencies(backend, { 'ticket-analyzer': disabledAgent })

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'hello',
        kombuseSessionId: 'trigger-session-abc',
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    // Falls back to default kombuse preset (not coder) since the agent is disabled
    const expectedTools = presetToAllowedTools(getTypePreset(undefined))
    expect(getCapturedOptions()?.allowedTools).toEqual(expectedTools)

    expect(
      getCapturedOptions()?.systemPrompt,
      'should have no system prompt when agent is disabled'
    ).toBeUndefined()
  })
})
