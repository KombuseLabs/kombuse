import { describe, it, expect, vi, beforeEach } from 'vitest'
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
  commentsRepository: {
    list: vi.fn(() => []),
    create: vi.fn(() => ({ id: 999 })),
    update: vi.fn(),
  },
  eventsRepository: {
    create: vi.fn(),
  },
  sessionsRepository: {},
  profilesRepository: {
    list: vi.fn(() => []),
  },
}))

import { agentInvocationsRepository, commentsRepository } from '@kombuse/persistence'
import {
  startAgentChatSession,
  presetToAllowedTools,
  getTypePreset,
  shouldAutoApprove,
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

  it('passes permissionMode plan for coder preset through to backend.start()', async () => {
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
        id: 'coder-agent',
        name: 'Coder Agent',
        system_prompt: '',
        is_enabled: true,
        config: { type: 'coder' },
        permissions: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
      processEvent: vi.fn(() => []),
      createBackend: vi.fn(() => mockBackend),
      generateSessionId: vi.fn(() => 'chat-coder-id' as KombuseSessionId),
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
        agentId: 'coder-agent',
        message: 'implement the feature',
        kombuseSessionId: 'chat-coder-id' as KombuseSessionId,
      },
      () => {},
      mockDependencies as any,
    )

    await waitForBackendStart(mockBackend)

    expect(capturedOptions?.permissionMode, 'coder preset should pass permissionMode plan').toBe('plan')
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

  it('includes agent role prompt in system prompt on resume', async () => {
    ;(agentInvocationsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([mockInvocation])

    const agentWithRole = {
      ...coderAgent,
      system_prompt: 'You are a read-only ticket analyzer. Do not modify any files.',
    }

    const { backend, getCapturedOptions } = createMockBackend()
    const deps = createMockDependencies(backend, { 'ticket-analyzer': agentWithRole })

    // Simulate a resumed session by returning an existing running session
    ;(deps.sessionPersistence.getSession as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'session-1',
      status: 'running',
      backend_session_id: 'backend-abc',
      ticket_id: 42,
    })

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'what about the failing tests?',
        kombuseSessionId: 'trigger-session-abc',
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    const systemPrompt = getCapturedOptions()?.systemPrompt
    expect(
      systemPrompt,
      'system prompt should be defined on resume'
    ).toBeDefined()
    expect(
      systemPrompt,
      'system prompt should contain the agent role prompt'
    ).toContain('You are a read-only ticket analyzer')
    expect(
      systemPrompt,
      'system prompt should include the Agent Role heading'
    ).toContain('## Agent Role')
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

  it('resumes a completed session (passes --resume flag)', async () => {
    ;(agentInvocationsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([mockInvocation])

    const { backend, getCapturedOptions } = createMockBackend()
    const deps = createMockDependencies(backend, { 'ticket-analyzer': coderAgent })

    ;(deps.sessionPersistence.getSession as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'session-1',
      status: 'completed',
      backend_session_id: 'backend-abc',
      ticket_id: 42,
    })

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'follow up question',
        kombuseSessionId: 'trigger-session-abc',
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    expect(
      getCapturedOptions()?.resumeSessionId,
      'should pass resumeSessionId for completed session'
    ).toBe('backend-abc')
  })

  it('resumes a failed session (passes --resume flag)', async () => {
    ;(agentInvocationsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([mockInvocation])

    const { backend, getCapturedOptions } = createMockBackend()
    const deps = createMockDependencies(backend, { 'ticket-analyzer': coderAgent })

    ;(deps.sessionPersistence.getSession as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'session-1',
      status: 'failed',
      backend_session_id: 'backend-abc',
      ticket_id: 42,
    })

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'retry this',
        kombuseSessionId: 'trigger-session-abc',
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    expect(getCapturedOptions()?.resumeSessionId).toBe('backend-abc')
  })

  it('attempts resume for completed session and does not inject history upfront', async () => {
    ;(agentInvocationsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([mockInvocation])

    const agentWithRole = {
      ...coderAgent,
      system_prompt: 'You are a ticket analyzer.',
    }

    const { backend, getCapturedOptions } = createMockBackend()
    const deps = createMockDependencies(backend, { 'ticket-analyzer': agentWithRole })

    ;(deps.sessionPersistence.getSession as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'session-1',
      status: 'completed',
      backend_session_id: 'backend-abc',
      ticket_id: 42,
    })

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'sky',
        kombuseSessionId: 'trigger-session-abc',
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    // Resume should be attempted for completed sessions
    expect(getCapturedOptions()?.resumeSessionId).toBe('backend-abc')
    // Conversation history is NOT injected upfront — only on retry via onResumeFailed
    const systemPrompt = getCapturedOptions()?.systemPrompt ?? ''
    expect(systemPrompt).not.toContain('## Prior Conversation')
    // Agent role prompt is still injected for sessions with prior context
    expect(systemPrompt).toContain('## Agent Role')
    expect(systemPrompt).toContain('You are a ticket analyzer.')
  })

  it('does not inject history when no prior session exists', async () => {
    ;(agentInvocationsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([mockInvocation])

    const { backend, getCapturedOptions } = createMockBackend()
    const deps = createMockDependencies(backend, { 'ticket-analyzer': coderAgent })

    ;(deps.sessionPersistence.getSession as ReturnType<typeof vi.fn>).mockReturnValue(null)

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

    const systemPrompt = getCapturedOptions()?.systemPrompt ?? ''
    expect(systemPrompt).not.toContain('## Prior Conversation')
  })

  it('does not inject history when session has no message events', async () => {
    ;(agentInvocationsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([mockInvocation])

    const { backend, getCapturedOptions } = createMockBackend()
    const deps = createMockDependencies(backend, { 'ticket-analyzer': coderAgent })

    ;(deps.sessionPersistence.getSession as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'session-1',
      status: 'completed',
      backend_session_id: 'backend-abc',
      ticket_id: 42,
    })

    ;(deps.sessionPersistence.getSessionEvents as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        id: 1,
        session_id: 'session-1',
        seq: 1,
        event_type: 'tool_use',
        payload: { type: 'tool_use', name: 'Read', input: {} },
        created_at: '2026-01-01T00:00:00Z',
      },
    ])

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'follow up',
        kombuseSessionId: 'trigger-session-abc',
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    const systemPrompt = getCapturedOptions()?.systemPrompt ?? ''
    expect(systemPrompt).not.toContain('## Prior Conversation')
  })
})

describe('startAgentChatSession fallback comment on complete', () => {
  type EventCallback = (event: AgentEvent) => void

  /** Create a backend where subscribe captures the callback for manual event firing. */
  function createEventDrivenBackend() {
    let eventCallback: EventCallback | undefined
    const backend: AgentBackend = {
      name: 'claude-code' as const,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn((cb: EventCallback) => {
        eventCallback = cb
        return () => {}
      }),
      isRunning: vi.fn(() => true),
      getBackendSessionId: vi.fn(() => 'backend-session-1'),
    }
    const fireEvent = (event: AgentEvent) => {
      eventCallback?.(event)
    }
    return { backend, fireEvent }
  }

  const testAgent = {
    id: 'test-agent',
    name: 'Test Agent',
    system_prompt: '',
    is_enabled: true,
    config: { type: 'kombuse' },
    permissions: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  function createDeps(backend: AgentBackend) {
    return {
      getAgent: vi.fn(() => testAgent),
      processEvent: vi.fn(() => []),
      createBackend: vi.fn(() => backend),
      generateSessionId: vi.fn(() => 'chat-fallback-id' as KombuseSessionId),
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

  function makeMessageEvent(content: string): AgentEvent {
    return {
      type: 'message',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      role: 'assistant',
      content,
    }
  }

  function makeToolUseEvent(name: string): AgentEvent {
    return {
      type: 'tool_use',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      id: 'tool-1',
      name,
      input: {},
    }
  }

  function makeCompleteEvent(): AgentEvent {
    return {
      type: 'complete',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      reason: 'result',
    }
  }

  beforeEach(() => {
    vi.mocked(commentsRepository.create).mockClear()
    vi.mocked(commentsRepository.list).mockReturnValue([])
  })

  it('creates fallback comment when agent produces text but does not call add_comment', async () => {
    const { backend, fireEvent } = createEventDrivenBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'what is the status?',
        kombuseSessionId: 'chat-fallback-id' as KombuseSessionId,
      },
      () => {},
      deps as any,
      { ticketId: 42 },
    )

    await waitForBackendStart(backend)

    fireEvent(makeMessageEvent('Here is my analysis of the ticket.'))
    fireEvent(makeCompleteEvent())

    expect(commentsRepository.create).toHaveBeenCalledOnce()
    expect(commentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: 42,
        author_id: 'test-agent',
        body: 'Here is my analysis of the ticket.',
        kombuse_session_id: 'chat-fallback-id',
      })
    )
  })

  it('skips fallback when agent called add_comment', async () => {
    const { backend, fireEvent } = createEventDrivenBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'analyze this',
        kombuseSessionId: 'chat-fallback-id' as KombuseSessionId,
      },
      () => {},
      deps as any,
      { ticketId: 42 },
    )

    await waitForBackendStart(backend)

    fireEvent(makeMessageEvent('I will post my analysis.'))
    fireEvent(makeToolUseEvent('mcp__kombuse__add_comment'))
    fireEvent(makeCompleteEvent())

    expect(commentsRepository.create).not.toHaveBeenCalled()
  })

  it('skips fallback when there is no assistant message', async () => {
    const { backend, fireEvent } = createEventDrivenBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'hi',
        kombuseSessionId: 'chat-fallback-id' as KombuseSessionId,
      },
      () => {},
      deps as any,
      { ticketId: 42 },
    )

    await waitForBackendStart(backend)

    // Complete without any assistant messages
    fireEvent(makeCompleteEvent())

    expect(commentsRepository.create).not.toHaveBeenCalled()
  })

  it('skips fallback when ticketId is not set', async () => {
    const { backend, fireEvent } = createEventDrivenBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'hello',
        kombuseSessionId: 'chat-fallback-id' as KombuseSessionId,
      },
      () => {},
      deps as any,
      // No ticketId
    )

    await waitForBackendStart(backend)

    fireEvent(makeMessageEvent('Some response text'))
    fireEvent(makeCompleteEvent())

    expect(commentsRepository.create).not.toHaveBeenCalled()
  })

  it('threads fallback comment under the user reply when found', async () => {
    const { backend, fireEvent } = createEventDrivenBackend()
    const deps = createDeps(backend)

    // Mock: the user's reply comment exists with the same session ID
    vi.mocked(commentsRepository.list).mockReturnValue([
      {
        id: 100,
        ticket_id: 42,
        author_id: 'user-1',
        parent_id: null,
        kombuse_session_id: 'chat-fallback-id',
        body: 'What is the status?',
        is_edited: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        external_source: null,
        external_id: null,
        synced_at: null,
        author: { id: 'user-1', type: 'user', name: 'Test User', email: null, description: null, avatar_url: null, external_source: null, external_id: null, is_active: true, created_at: '', updated_at: '' },
      } as any,
    ])

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'what is the status?',
        kombuseSessionId: 'chat-fallback-id' as KombuseSessionId,
      },
      () => {},
      deps as any,
      { ticketId: 42 },
    )

    await waitForBackendStart(backend)

    fireEvent(makeMessageEvent('Here is the analysis.'))
    fireEvent(makeCompleteEvent())

    expect(commentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: 42,
        parent_id: 100,
        body: 'Here is the analysis.',
      })
    )
  })
})

describe('startAgentChatSession plan-to-comment bridge', () => {
  type EventCallback = (event: AgentEvent) => void

  function createEventDrivenBackend() {
    let eventCallback: EventCallback | undefined
    const backend: AgentBackend = {
      name: 'claude-code' as const,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn((cb: EventCallback) => {
        eventCallback = cb
        return () => {}
      }),
      isRunning: vi.fn(() => true),
      getBackendSessionId: vi.fn(() => 'backend-session-1'),
    }
    const fireEvent = (event: AgentEvent) => {
      eventCallback?.(event)
    }
    return { backend, fireEvent }
  }

  const coderAgent = {
    id: 'coder-agent',
    name: 'Coder Agent',
    system_prompt: '',
    is_enabled: true,
    config: { type: 'coder' },
    permissions: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  function createDeps(backend: AgentBackend) {
    return {
      getAgent: vi.fn(() => coderAgent),
      processEvent: vi.fn(() => []),
      createBackend: vi.fn(() => backend),
      generateSessionId: vi.fn(() => 'chat-plan-id' as KombuseSessionId),
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

  beforeEach(() => {
    vi.mocked(commentsRepository.create).mockClear()
    vi.mocked(commentsRepository.update).mockClear()
    vi.mocked(commentsRepository.list).mockReturnValue([])
  })

  it('creates a plan comment when ExitPlanMode tool result arrives', async () => {
    const { backend, fireEvent } = createEventDrivenBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'coder-agent',
        message: 'implement the feature',
        kombuseSessionId: 'chat-plan-id' as KombuseSessionId,
      },
      () => {},
      deps as any,
      { ticketId: 42 },
    )

    await waitForBackendStart(backend)

    // Emit ExitPlanMode tool_use followed by its tool_result
    fireEvent({
      type: 'tool_use',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      id: 'plan-tool-1',
      name: 'ExitPlanMode',
      input: {},
    })
    fireEvent({
      type: 'tool_result',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      toolUseId: 'plan-tool-1',
      content: '## Approved Plan:\n1. Add types\n2. Write tests\n3. Implement',
    })

    expect(commentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: 42,
        author_id: 'coder-agent',
        body: expect.stringContaining('1. Add types'),
        kombuse_session_id: 'chat-plan-id',
      })
    )
    expect(commentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('**Implementation Plan**'),
      })
    )
  })

  it('does not create plan comment when there is no ticketId', async () => {
    const { backend, fireEvent } = createEventDrivenBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'coder-agent',
        message: 'implement the feature',
        kombuseSessionId: 'chat-plan-id' as KombuseSessionId,
      },
      () => {},
      deps as any,
      // No ticketId
    )

    await waitForBackendStart(backend)

    fireEvent({
      type: 'tool_use',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      id: 'plan-tool-2',
      name: 'ExitPlanMode',
      input: {},
    })
    fireEvent({
      type: 'tool_result',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      toolUseId: 'plan-tool-2',
      content: '1. Do stuff',
    })

    expect(commentsRepository.create).not.toHaveBeenCalled()
  })

  it('updates existing plan comment on second ExitPlanMode call', async () => {
    const { backend, fireEvent } = createEventDrivenBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'coder-agent',
        message: 'implement the feature',
        kombuseSessionId: 'chat-plan-id' as KombuseSessionId,
      },
      () => {},
      deps as any,
      { ticketId: 42 },
    )

    await waitForBackendStart(backend)

    // First ExitPlanMode — should create a new plan comment
    fireEvent({
      type: 'tool_use',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      id: 'plan-tool-1',
      name: 'ExitPlanMode',
      input: {},
    })
    fireEvent({
      type: 'tool_result',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      toolUseId: 'plan-tool-1',
      content: '## Approved Plan:\n1. Add types\n2. Write tests',
    })

    expect(commentsRepository.create).toHaveBeenCalledOnce()
    expect(commentsRepository.update).not.toHaveBeenCalled()

    // Second ExitPlanMode — should update the existing comment (id: 999)
    fireEvent({
      type: 'tool_use',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      id: 'plan-tool-2',
      name: 'ExitPlanMode',
      input: {},
    })
    fireEvent({
      type: 'tool_result',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      toolUseId: 'plan-tool-2',
      content: '## Approved Plan:\n1. Add types\n2. Write tests\n3. Deploy',
    })

    // create should still have been called only once (from the first plan)
    expect(commentsRepository.create).toHaveBeenCalledOnce()
    // update should be called with the comment id from create (999)
    expect(commentsRepository.update).toHaveBeenCalledOnce()
    expect(commentsRepository.update).toHaveBeenCalledWith(
      999,
      expect.objectContaining({
        body: expect.stringContaining('3. Deploy'),
      })
    )
  })

  it('does not create plan comment when ExitPlanMode tool result has isError', async () => {
    const { backend, fireEvent } = createEventDrivenBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'coder-agent',
        message: 'implement the feature',
        kombuseSessionId: 'chat-plan-denied' as KombuseSessionId,
      },
      () => {},
      deps as any,
      { ticketId: 42 },
    )

    await waitForBackendStart(backend)

    fireEvent({
      type: 'tool_use',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      id: 'plan-tool-denied',
      name: 'ExitPlanMode',
      input: {},
    })
    fireEvent({
      type: 'tool_result',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      toolUseId: 'plan-tool-denied',
      content: 'The user denied this request.',
      isError: true,
    })

    expect(commentsRepository.create).not.toHaveBeenCalled()
  })
})

describe('ExitPlanMode auto-approval', () => {
  it('ExitPlanMode is not auto-approved for coder agents', () => {
    const preset = getTypePreset('coder')
    expect(shouldAutoApprove('ExitPlanMode', {}, preset)).toBe(false)
  })

  it('EnterPlanMode is still auto-approved for coder agents', () => {
    const preset = getTypePreset('coder')
    expect(shouldAutoApprove('EnterPlanMode', {}, preset)).toBe(true)
  })
})
