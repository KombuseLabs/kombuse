import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BACKEND_TYPES, type AgentBackend, type AgentEvent, type KombuseSessionId, type StartOptions } from '@kombuse/types'

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

vi.mock('../services/codex-mcp-config', () => ({
  getCodexMcpStatus: vi.fn(() => ({
    enabled: false,
    configured: false,
    config_path: '/tmp/.codex/config.toml',
    command: null,
    args: [],
    bridge_path: null,
  })),
  resolveKombuseBridgeCommandConfig: vi.fn(() => null),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
    readFileSync: vi.fn(actual.readFileSync),
  }
})

vi.mock('@kombuse/persistence', () => ({
  agentInvocationsRepository: {
    list: vi.fn(() => []),
    create: vi.fn((input: Record<string, unknown>) => ({ id: 100, ...input, status: 'pending', attempts: 0, max_attempts: 3, run_at: new Date().toISOString(), result: null, error: null, started_at: null, completed_at: null, created_at: new Date().toISOString() })),
    countRecentByTicketId: vi.fn(() => 0),
    findActiveByAgentAndTicket: vi.fn(() => null),
    update: vi.fn(() => null),
    failBySessionId: vi.fn(() => 0),
  },
  commentsRepository: {
    get: vi.fn(() => null),
    list: vi.fn(() => []),
    create: vi.fn(() => ({ id: 999 })),
    update: vi.fn(),
  },
  eventsRepository: {
    create: vi.fn(),
  },
  sessionEventsRepository: {
    getNextSeq: vi.fn(() => 1),
    create: vi.fn(),
  },
  labelsRepository: {
    getTicketLabels: vi.fn(() => []),
  },
  projectsRepository: {
    get: vi.fn(() => null),
    getByIdOrSlug: vi.fn(() => null),
  },
  sessionsRepository: {
    get: vi.fn(() => null),
    getByKombuseSessionId: vi.fn(() => null),
    list: vi.fn(() => []),
    update: vi.fn(),
    listByTicket: vi.fn(() => []),
  },
  ticketsRepository: {
    _getInternal: vi.fn(() => null),
  },
  profilesRepository: {
    list: vi.fn(() => []),
    get: vi.fn(() => null),
  },
  profileSettingsRepository: {
    get: vi.fn(() => null),
  },
}))

import {
  agentInvocationsRepository,
  commentsRepository,
  profileSettingsRepository,
  projectsRepository,
  sessionsRepository,
  ticketsRepository,
} from '@kombuse/persistence'
import { getCodexMcpStatus } from '../services/codex-mcp-config'
import { createSessionLogger } from '../logger'
import { wsHub } from '../websocket/hub'
import {
  startAgentChatSession,
  createServerAgentBackend,
  presetToAllowedTools,
  getTypePreset,
  shouldAutoApprove,
  stopAgentSession,
  stopAllActiveBackends,
  cleanupOrphanedSessions,
  getActiveSessions,
  getPendingPermissions,
  registerBackend,
  resetBackendIdleTimeout,
  respondToPermission,
  processEventAndRunAgents,
  computeTicketAgentStatus,
  type AgentExecutionEvent,
} from '../services/agent-execution-service'
import { broadcastPermissionPending } from '../services/agent-execution-service/permission-service'
import { existsSync, readFileSync } from 'node:fs'
import { backendIdleTimeouts, serverPendingPermissions } from '../services/agent-execution-service/runtime-state'

// Clean up persistent backends between tests to prevent cross-test state pollution
afterEach(() => {
  stopAllActiveBackends()
})

/** Wait for async work fired by startAgentChatSession (which is sync but spawns async). */
async function waitForBackendStart(backend: AgentBackend): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if ((backend.start as ReturnType<typeof vi.fn>).mock.calls.length > 0) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('backend.start() was not called within timeout')
}

describe('ticket title propagation for active sessions', () => {
  function createPassiveBackend(name: AgentBackend['name'] = BACKEND_TYPES.CLAUDE_CODE): AgentBackend {
    return {
      name,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      isRunning: vi.fn(() => true),
      getBackendSessionId: vi.fn(() => undefined),
    }
  }

  function createDeps(backend: AgentBackend) {
    return {
      getAgent: vi.fn(() => null),
      processEvent: vi.fn(() => []),
      createBackend: vi.fn(() => backend),
      generateSessionId: vi.fn(() => 'chat-ticket-title-id' as KombuseSessionId),
      resolveProjectPath: vi.fn(() => '/tmp'),
      sessionPersistence: {
        ensureSession: vi.fn(() => 'session-1'),
        getSession: vi.fn(() => ({
          id: 'session-1',
          kombuse_session_id: 'chat-ticket-title-id',
          backend_type: BACKEND_TYPES.CLAUDE_CODE,
          backend_session_id: null,
          ticket_id: 42,
          project_id: null,
          agent_id: null,
          status: 'pending',
          metadata: {},
          started_at: new Date().toISOString(),
          completed_at: null,
          failed_at: null,
          last_event_seq: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
        markSessionRunning: vi.fn(),
        persistEvent: vi.fn(),
        completeSession: vi.fn(),
        failSession: vi.fn(),
        getSessionByKombuseId: vi.fn(() => null),
        getSessionEvents: vi.fn(() => []),
      },
      stateMachine: {
        transition: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        setMetadata: vi.fn(),
      },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ticketsRepository._getInternal).mockReturnValue(null)
    vi.mocked(sessionsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([])
  })

  it('includes ticketTitle, effectiveBackend, and appliedModel in started event when resolvable', () => {
    const backend = createPassiveBackend(BACKEND_TYPES.CODEX)
    const deps = createDeps(backend)
    const emittedEvents: AgentExecutionEvent[] = []

    vi.mocked(ticketsRepository._getInternal).mockReturnValue({
      id: 42,
      ticket_number: 42,
      title: 'Improve active agent context row',
    } as any)

    startAgentChatSession(
      {
        type: 'agent.invoke',
        message: 'hello',
        kombuseSessionId: 'chat-ticket-title-id' as KombuseSessionId,
        backendType: BACKEND_TYPES.CODEX,
        modelPreference: 'gpt-5-mini',
      },
      (event) => emittedEvents.push(event),
      deps as any
    )

    const started = emittedEvents.find(
      (event): event is Extract<AgentExecutionEvent, { type: 'started' }> => event.type === 'started'
    )

    expect(started).toBeDefined()
    expect(started).toMatchObject({
      kombuseSessionId: 'chat-ticket-title-id',
      ticketNumber: 42,
      ticketTitle: 'Improve active agent context row',
      effectiveBackend: BACKEND_TYPES.CODEX,
      appliedModel: 'gpt-5-mini',
    })
  })

  it('keeps ticketTitle and appliedModel undefined in started event when unavailable', () => {
    const backend = createPassiveBackend()
    const deps = createDeps(backend)
    const emittedEvents: AgentExecutionEvent[] = []

    vi.mocked(ticketsRepository._getInternal).mockReturnValue({
      id: 42,
      ticket_number: 42,
    } as any)

    startAgentChatSession(
      {
        type: 'agent.invoke',
        message: 'hello',
        kombuseSessionId: 'chat-ticket-title-id' as KombuseSessionId,
      },
      (event) => emittedEvents.push(event),
      deps as any
    )

    const started = emittedEvents.find(
      (event): event is Extract<AgentExecutionEvent, { type: 'started' }> => event.type === 'started'
    )

    expect(started).toBeDefined()
    expect(started?.ticketNumber).toBe(42)
    expect(started?.ticketTitle).toBeUndefined()
    expect(started?.effectiveBackend).toBe(BACKEND_TYPES.CLAUDE_CODE)
    expect(started?.appliedModel).toBeUndefined()
  })

  it('enriches getActiveSessions with ticket titles, backend metadata, and fallback behavior', () => {
    vi.mocked(sessionsRepository.list as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce([
        {
          kombuse_session_id: 'running-session-1',
          agent_name: 'Agent A',
          backend_type: BACKEND_TYPES.CLAUDE_CODE,
          metadata: {
            effective_backend: BACKEND_TYPES.CODEX,
            applied_model: 'gpt-5-mini',
          },
          ticket_id: 42,
          started_at: '2026-02-14T00:00:00.000Z',
        },
        {
          kombuse_session_id: 'running-session-2',
          agent_name: 'Agent B',
          backend_type: BACKEND_TYPES.CLAUDE_CODE,
          metadata: {},
          ticket_id: 43,
          started_at: '2026-02-14T00:01:00.000Z',
        },
      ])
      .mockReturnValueOnce([
        {
          kombuse_session_id: 'running-session-3',
          agent_name: 'Agent C',
          backend_type: BACKEND_TYPES.MOCK,
          metadata: {
            applied_model: null,
          },
          ticket_id: null,
          started_at: '2026-02-14T00:02:00.000Z',
        },
      ])

    vi.mocked(ticketsRepository._getInternal).mockImplementation((ticketId: number) => {
      if (ticketId === 42) {
        return {
          id: 42,
          ticket_number: 42,
          title: 'Show ticket title in active agents',
        } as any
      }
      return null
    })

    const sessions = getActiveSessions()

    expect(sessions).toEqual([
      expect.objectContaining({
        kombuseSessionId: 'running-session-1',
        ticketNumber: 42,
        ticketTitle: 'Show ticket title in active agents',
        effectiveBackend: BACKEND_TYPES.CODEX,
        appliedModel: 'gpt-5-mini',
      }),
      expect.objectContaining({
        kombuseSessionId: 'running-session-2',
        ticketNumber: undefined,
        ticketTitle: undefined,
        effectiveBackend: BACKEND_TYPES.CLAUDE_CODE,
        appliedModel: undefined,
      }),
      expect.objectContaining({
        kombuseSessionId: 'running-session-3',
        ticketNumber: undefined,
        ticketTitle: undefined,
        effectiveBackend: BACKEND_TYPES.MOCK,
        appliedModel: undefined,
      }),
    ])
  })

  it('returns active sessions from DB even without registered backends (regression #370)', () => {
    vi.mocked(sessionsRepository.list as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce([
        {
          kombuse_session_id: 'orphan-session-1',
          agent_name: 'Orphan Agent',
          backend_type: BACKEND_TYPES.CLAUDE_CODE,
          metadata: {},
          ticket_id: 99,
          started_at: '2026-02-14T00:00:00.000Z',
        },
      ])
      .mockReturnValueOnce([])

    vi.mocked(ticketsRepository._getInternal).mockReturnValue(null)

    const sessions = getActiveSessions()

    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.kombuseSessionId).toBe('orphan-session-1')
    expect(sessions[0]!.agentName).toBe('Orphan Agent')
  })
})

describe('computeTicketAgentStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports running status from DB sessions without backend registration (regression #370)', () => {
    vi.mocked(sessionsRepository.listByTicket as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce([{ kombuse_session_id: 'ksess-1', status: 'running' }])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])

    const result = computeTicketAgentStatus(42)

    expect(result.status).toBe('running')
    expect(result.sessionCount).toBe(1)
  })

  it('counts pending sessions as active', () => {
    vi.mocked(sessionsRepository.listByTicket as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ kombuse_session_id: 'ksess-2', status: 'pending' }])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])

    const result = computeTicketAgentStatus(42)

    expect(result.status).toBe('running')
    expect(result.sessionCount).toBe(1)
  })

  it('reports error when recent failures exist and no active sessions', () => {
    vi.mocked(sessionsRepository.listByTicket as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{
        kombuse_session_id: 'ksess-3',
        status: 'failed',
        failed_at: '2026-02-14T01:00:00.000Z',
        updated_at: '2026-02-14T01:00:00.000Z',
      }])
      .mockReturnValueOnce([])

    const result = computeTicketAgentStatus(42)

    expect(result.status).toBe('error')
    expect(result.sessionCount).toBe(0)
  })

  it('reports idle when no active or failed sessions exist', () => {
    vi.mocked(sessionsRepository.listByTicket as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])

    const result = computeTicketAgentStatus(42)

    expect(result.status).toBe('idle')
    expect(result.sessionCount).toBe(0)
  })
})

describe('processEventAndRunAgents ticket trigger suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips processing when triggers are disabled on the ticket', async () => {
    ;(ticketsRepository._getInternal as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 42,
      triggers_enabled: false,
    })

    const processEvent = vi.fn(() => [])
    await processEventAndRunAgents(
      {
        id: 1,
        event_type: 'ticket.updated',
        project_id: '1',
        ticket_id: 42,
        ticket_number: null,
        comment_id: null,
        actor_id: 'user-1',
        actor_type: 'user',
        kombuse_session_id: null,
        payload: '{}',
        created_at: new Date().toISOString(),
        actor: null,
      },
      { processEvent } as any
    )

    expect(processEvent).not.toHaveBeenCalled()
  })

  it('continues processing when triggers are enabled on the ticket', async () => {
    ;(ticketsRepository._getInternal as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 42,
      triggers_enabled: true,
    })

    const processEvent = vi.fn(() => [])
    const event = {
      id: 2,
      event_type: 'ticket.updated',
      project_id: '1',
      ticket_id: 42,
      ticket_number: null,
      comment_id: null,
      actor_id: 'user-1',
      actor_type: 'user' as const,
      kombuse_session_id: null,
      payload: '{}',
      created_at: new Date().toISOString(),
      actor: null,
    }

    await processEventAndRunAgents(event, { processEvent } as any)

    expect(processEvent).toHaveBeenCalledTimes(1)
    expect(processEvent).toHaveBeenCalledWith(event)
  })
})

describe('processEventAndRunAgents lifecycle session isolation', () => {
  const upstreamSessionId = 'trigger-550e8400-e29b-41d4-a716-446655440000'

  function createInvocation(agentId: string) {
    return {
      id: 501,
      agent_id: agentId,
      trigger_id: 12,
      event_id: 9734,
      session_id: null,
      project_id: '1',
      kombuse_session_id: null,
      status: 'pending' as const,
      attempts: 0,
      max_attempts: 3,
      run_at: new Date().toISOString(),
      context: { ticket_id: 42, project_id: '1' },
      result: null,
      error: null,
      started_at: null,
      completed_at: null,
      created_at: new Date().toISOString(),
    }
  }

  function createLifecycleEvent(actorId: string) {
    return {
      id: 9734,
      event_type: 'agent.completed',
      project_id: '1',
      ticket_id: 42,
      ticket_number: null,
      comment_id: null,
      actor_id: actorId,
      actor_type: 'agent' as const,
      kombuse_session_id: upstreamSessionId,
      payload: '{}',
      created_at: new Date().toISOString(),
      actor: null,
    }
  }

  function createDeps(invocation: ReturnType<typeof createInvocation>) {
    const backend: AgentBackend = {
      name: BACKEND_TYPES.CLAUDE_CODE,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      isRunning: vi.fn(() => true),
      getBackendSessionId: vi.fn(() => undefined),
    }

    return {
      getAgent: vi.fn((agentId: string) => ({
        id: agentId,
        system_prompt: '',
        is_enabled: true,
        config: { type: 'kombuse' },
      })),
      processEvent: vi.fn(() => [invocation]),
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
      stateMachine: {
        transition: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        setMetadata: vi.fn(),
      },
    }
  }

  function getAssignedSessionId(invocationId: number): string | undefined {
    const calls = vi.mocked(agentInvocationsRepository.update).mock.calls.filter(
      ([id, input]) =>
        id === invocationId
        && Object.prototype.hasOwnProperty.call(input as Record<string, unknown>, 'kombuse_session_id')
    )
    const patch = calls[0]?.[1] as { kombuse_session_id?: string } | undefined
    return patch?.kombuse_session_id
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(agentInvocationsRepository.countRecentByTicketId as ReturnType<typeof vi.fn>).mockReturnValue(0)
    ;(ticketsRepository._getInternal as ReturnType<typeof vi.fn>).mockReturnValue(null)
  })

  it('uses a fresh trigger session for cross-agent lifecycle handoff', async () => {
    const invocation = createInvocation('pipeline-orchestrator')
    const event = createLifecycleEvent('triage-agent')
    const deps = createDeps(invocation)

    await processEventAndRunAgents(event as any, deps as any)

    const assignedSessionId = getAssignedSessionId(invocation.id)
    expect(assignedSessionId).toBeDefined()
    expect(assignedSessionId).not.toBe(upstreamSessionId)
    expect(assignedSessionId).toMatch(/^trigger-/)
  })

  it('reuses lifecycle session only for same-agent continuation', async () => {
    const invocation = createInvocation('triage-agent')
    const event = createLifecycleEvent('triage-agent')
    const deps = createDeps(invocation)

    await processEventAndRunAgents(event as any, deps as any)

    expect(getAssignedSessionId(invocation.id)).toBe(upstreamSessionId)
  })

  it('passes event project_id into session persistence', async () => {
    const invocation = createInvocation('triage-agent')
    const event = createLifecycleEvent('triage-agent')
    const deps = createDeps(invocation)

    await processEventAndRunAgents(event as any, deps as any)

    const ensureSessionCalls = (deps.sessionPersistence.ensureSession as ReturnType<typeof vi.fn>).mock.calls
    expect(ensureSessionCalls.length).toBeGreaterThan(0)
    expect(ensureSessionCalls[0]?.[4]).toBe('1')
  })

  it('should skip loop guard when loop_protection_enabled is false on ticket', async () => {
    ;(ticketsRepository._getInternal as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 42,
      triggers_enabled: true,
      loop_protection_enabled: false,
    })
    ;(agentInvocationsRepository.countRecentByTicketId as ReturnType<typeof vi.fn>).mockReturnValue(100)

    const invocation = createInvocation('triage-agent')
    const event = createLifecycleEvent('triage-agent')
    const deps = createDeps(invocation)

    await processEventAndRunAgents(event as any, deps as any)

    // Should NOT have been marked as failed despite high count
    const failCalls = (agentInvocationsRepository.update as ReturnType<typeof vi.fn>).mock.calls
      .filter((args: unknown[]) => {
        const input = args[1] as Record<string, unknown> | undefined
        return input?.status === 'failed' && typeof input.error === 'string' && (input.error as string).startsWith('Chain depth limit')
      })
    expect(failCalls).toHaveLength(0)
  })

  it('should enforce loop guard when loop_protection_enabled is true on ticket', async () => {
    ;(ticketsRepository._getInternal as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 42,
      triggers_enabled: true,
      loop_protection_enabled: true,
    })
    ;(agentInvocationsRepository.countRecentByTicketId as ReturnType<typeof vi.fn>).mockReturnValue(100)

    const invocation = createInvocation('triage-agent')
    const event = createLifecycleEvent('triage-agent')
    const deps = createDeps(invocation)

    await processEventAndRunAgents(event as any, deps as any)

    // Should be marked as failed due to loop guard
    const failCalls = (agentInvocationsRepository.update as ReturnType<typeof vi.fn>).mock.calls
      .filter((args: unknown[]) => {
        const input = args[1] as Record<string, unknown> | undefined
        return input?.status === 'failed' && typeof input.error === 'string' && (input.error as string).startsWith('Chain depth limit')
      })
    expect(failCalls.length).toBeGreaterThan(0)
  })
})

describe('startAgentChatSession backend selection', () => {
  beforeEach(() => {
    ;(profileSettingsRepository.get as ReturnType<typeof vi.fn>).mockReset()
    ;(profileSettingsRepository.get as ReturnType<typeof vi.fn>).mockReturnValue(null)
  })

  function createPassiveBackend(name: AgentBackend['name']): AgentBackend {
    return {
      name,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      isRunning: vi.fn(() => true),
      getBackendSessionId: vi.fn(() => undefined),
    }
  }

  function createDependencies(createBackend: ReturnType<typeof vi.fn>) {
    return {
      getAgent: vi.fn(() => null),
      processEvent: vi.fn(() => []),
      createBackend,
      generateSessionId: vi.fn(() => 'chat-backend-id' as KombuseSessionId),
      resolveProjectPath: vi.fn(() => '/tmp'),
      sessionPersistence: {
        ensureSession: vi.fn(() => 'session-1'),
        getSession: vi.fn(() => ({
          id: 'session-1',
          kombuse_session_id: 'chat-backend-id',
          backend_type: BACKEND_TYPES.CLAUDE_CODE,
          backend_session_id: null,
          ticket_id: null,
          agent_id: null,
          status: 'pending',
          metadata: {},
          started_at: new Date().toISOString(),
          completed_at: null,
          failed_at: null,
          last_event_seq: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
        markSessionRunning: vi.fn(),
        persistEvent: vi.fn(),
        completeSession: vi.fn(),
        failSession: vi.fn(),
        getSessionByKombuseId: vi.fn(() => null),
        getSessionEvents: vi.fn(() => []),
      },
      stateMachine: {
        transition: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        setMetadata: vi.fn(),
      },
    }
  }

  it('uses persisted session backend type when resuming', async () => {
    const backend = createPassiveBackend(BACKEND_TYPES.CODEX)
    const createBackend = vi.fn(() => backend)
    const deps = createDependencies(createBackend)

    ;(deps.sessionPersistence.getSessionByKombuseId as ReturnType<typeof vi.fn>).mockReturnValue({
      backend_type: BACKEND_TYPES.CODEX,
    })

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'hello',
        kombuseSessionId: 'chat-backend-id' as KombuseSessionId,
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    expect(createBackend).toHaveBeenCalledWith(BACKEND_TYPES.CODEX)
  })

  it('prefers explicit backendType override over persisted session backend', async () => {
    const backend = createPassiveBackend(BACKEND_TYPES.CODEX)
    const createBackend = vi.fn(() => backend)
    const deps = createDependencies(createBackend)

    ;(deps.sessionPersistence.getSessionByKombuseId as ReturnType<typeof vi.fn>).mockReturnValue({
      backend_type: BACKEND_TYPES.CLAUDE_CODE,
    })

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'hello',
        kombuseSessionId: 'chat-backend-id' as KombuseSessionId,
        backendType: BACKEND_TYPES.CODEX,
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    expect(createBackend).toHaveBeenCalledWith(BACKEND_TYPES.CODEX)
  })

  it('stops running backend when switching backend type for the same session', async () => {
    const existingBackend = createPassiveBackend(BACKEND_TYPES.CLAUDE_CODE)
    registerBackend('chat-backend-id', existingBackend)

    const newBackend = createPassiveBackend(BACKEND_TYPES.CODEX)
    const createBackend = vi.fn(() => newBackend)
    const deps = createDependencies(createBackend)

    ;(deps.sessionPersistence.getSessionByKombuseId as ReturnType<typeof vi.fn>).mockReturnValue({
      backend_type: BACKEND_TYPES.CLAUDE_CODE,
    })

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'switch backend',
        kombuseSessionId: 'chat-backend-id' as KombuseSessionId,
        backendType: BACKEND_TYPES.CODEX,
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(newBackend)

    expect(existingBackend.stop).toHaveBeenCalled()
    expect(createBackend).toHaveBeenCalledWith(BACKEND_TYPES.CODEX)
  })

  it('uses user global default backend when session and agent backend are absent', async () => {
    const backend = createPassiveBackend(BACKEND_TYPES.CODEX)
    const createBackend = vi.fn(() => backend)
    const deps = createDependencies(createBackend)

    ;(profileSettingsRepository.get as ReturnType<typeof vi.fn>).mockImplementation(
      (_profileId: string, key: string) => {
        if (key === 'chat.default_backend_type') {
          return { setting_value: BACKEND_TYPES.CODEX }
        }
        return null
      }
    )

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'hello',
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    expect(createBackend).toHaveBeenCalledWith(BACKEND_TYPES.CODEX)
  })

  it('passes resolved model to codex backend and stores session snapshot metadata', async () => {
    const backend = createPassiveBackend(BACKEND_TYPES.CODEX)
    const createBackend = vi.fn(() => backend)
    const deps = createDependencies(createBackend)

    ;(deps.getAgent as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'agent-1',
      is_enabled: true,
      system_prompt: 'You are helpful',
      config: {
        backend_type: BACKEND_TYPES.CODEX,
        model: 'gpt-5-mini',
      },
    })

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'agent-1',
        message: 'hello',
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    const startOptions = (backend.start as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as StartOptions
    expect(startOptions.model).toBe('gpt-5-mini')
    expect(deps.stateMachine.setMetadata).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        effective_backend: BACKEND_TYPES.CODEX,
        model_preference: 'gpt-5-mini',
        applied_model: 'gpt-5-mini',
      })
    )
  })

  it('persists runtime config metadata (preset type, permission mode, thinking)', async () => {
    const backend = createPassiveBackend(BACKEND_TYPES.CLAUDE_CODE)
    const createBackend = vi.fn(() => backend)
    const deps = createDependencies(createBackend)

    ;(deps.getAgent as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'agent-coder',
      is_enabled: true,
      system_prompt: 'You are a coder',
      config: {
        type: 'coder',
        anthropic: {
          thinking: true,
          thinking_budget: 8000,
        },
      },
    })

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'agent-coder',
        message: 'hello',
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    expect(deps.stateMachine.setMetadata).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        agent_preset_type: 'coder',
        permission_mode: 'plan',
        thinking_enabled: true,
        thinking_budget: 8000,
      })
    )
  })

  it('persists default runtime config when agent has no thinking config', async () => {
    const backend = createPassiveBackend(BACKEND_TYPES.CLAUDE_CODE)
    const createBackend = vi.fn(() => backend)
    const deps = createDependencies(createBackend)

    ;(deps.getAgent as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'agent-basic',
      is_enabled: true,
      system_prompt: 'You are basic',
      config: {},
    })

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'agent-basic',
        message: 'hello',
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    expect(deps.stateMachine.setMetadata).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        agent_preset_type: 'kombuse',
        permission_mode: null,
        thinking_enabled: false,
        thinking_budget: null,
      })
    )
  })
})

describe('createServerAgentBackend codex MCP setting', () => {
  afterEach(() => {
    ;(getCodexMcpStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      enabled: false,
      configured: false,
      config_path: '/tmp/.codex/config.toml',
      command: null,
      args: [],
      bridge_path: null,
    })
  })

  it('disables MCP for Codex by default', () => {
    ;(getCodexMcpStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      enabled: false,
      configured: true,
      config_path: '/tmp/.codex/config.toml',
      command: 'bun',
      args: ['run', '/tmp/bridge.ts'],
      bridge_path: '/tmp/bridge.ts',
    })

    const backend = createServerAgentBackend(BACKEND_TYPES.CODEX) as any
    const extraArgs = backend.options?.extraArgs as string[]

    expect(extraArgs).toContain('mcp_servers.kombuse.enabled=false')
  })

  it('enables MCP for Codex when user setting is true', () => {
    ;(getCodexMcpStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      enabled: true,
      configured: true,
      config_path: '/tmp/.codex/config.toml',
      command: 'bun',
      args: ['run', '/tmp/bridge.ts'],
      bridge_path: '/tmp/bridge.ts',
    })

    const backend = createServerAgentBackend(BACKEND_TYPES.CODEX) as any
    const extraArgs = backend.options?.extraArgs as string[]

    expect(extraArgs).toContain('mcp_servers.kombuse.enabled=true')
  })
})

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
      stateMachine: {
        transition: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        setMetadata: vi.fn(),
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
      stateMachine: {
        transition: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        setMetadata: vi.fn(),
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

describe('startAgentChatSession continuation project scoping', () => {
  function createPassiveBackend(): AgentBackend {
    return {
      name: BACKEND_TYPES.CLAUDE_CODE,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      isRunning: vi.fn(() => true),
      getBackendSessionId: vi.fn(() => undefined),
    }
  }

  function createDependencies(backend: AgentBackend) {
    return {
      getAgent: vi.fn(() => ({
        id: 'ticket-analyzer',
        is_enabled: true,
        system_prompt: '',
        config: { type: 'coder' },
      })),
      processEvent: vi.fn(() => []),
      createBackend: vi.fn(() => backend),
      generateSessionId: vi.fn(() => 'trigger-session-abc' as KombuseSessionId),
      resolveProjectPath: vi.fn(() => '/tmp'),
      sessionPersistence: {
        ensureSession: vi.fn(() => 'session-1'),
        getSession: vi.fn(() => ({
          id: 'session-1',
          kombuse_session_id: 'trigger-session-abc',
          backend_type: BACKEND_TYPES.CLAUDE_CODE,
          backend_session_id: 'backend-abc',
          ticket_id: 42,
          project_id: null,
          agent_id: 'ticket-analyzer',
          status: 'completed',
          metadata: {},
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          failed_at: null,
          last_event_seq: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
        markSessionRunning: vi.fn(),
        persistEvent: vi.fn(),
        completeSession: vi.fn(),
        failSession: vi.fn(),
        getSessionByKombuseId: vi.fn(() => null),
        getSessionEvents: vi.fn(() => []),
      },
      stateMachine: {
        transition: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        setMetadata: vi.fn(),
      },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(projectsRepository.get as ReturnType<typeof vi.fn>).mockReturnValue(null)
  })

  it('skips stale legacy context project_id when creating continuation invocation', async () => {
    const backend = createPassiveBackend()
    const deps = createDependencies(backend)

    ;(agentInvocationsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        id: 17,
        agent_id: 'ticket-analyzer',
        trigger_id: 11,
        event_id: 99,
        session_id: null,
        project_id: null,
        kombuse_session_id: 'trigger-session-abc',
        status: 'completed',
        attempts: 1,
        max_attempts: 3,
        run_at: new Date().toISOString(),
        context: { project_id: 'deleted-project', ticket_id: 42 },
        result: null,
        error: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ])

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'resume this session',
        kombuseSessionId: 'trigger-session-abc' as KombuseSessionId,
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    expect(projectsRepository.get).toHaveBeenCalledWith('deleted-project')
    expect(agentInvocationsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'session-1',
        project_id: undefined,
      })
    )
  })

  it('uses persisted session project_id over message projectId for continuation', async () => {
    const backend = createPassiveBackend()
    const deps = createDependencies(backend)

    ;(deps.sessionPersistence.getSession as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'session-1',
      kombuse_session_id: 'trigger-session-abc',
      backend_type: BACKEND_TYPES.CLAUDE_CODE,
      backend_session_id: 'backend-abc',
      ticket_id: 42,
      project_id: 'proj-A',
      agent_id: 'ticket-analyzer',
      status: 'completed',
      metadata: {},
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      failed_at: null,
      last_event_seq: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    ;(agentInvocationsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        id: 17,
        agent_id: 'ticket-analyzer',
        trigger_id: 11,
        event_id: 99,
        session_id: 'session-1',
        project_id: 'proj-A',
        kombuse_session_id: 'trigger-session-abc',
        status: 'completed',
        attempts: 1,
        max_attempts: 3,
        run_at: new Date().toISOString(),
        context: {},
        result: null,
        error: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ])

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'resume this session',
        kombuseSessionId: 'trigger-session-abc' as KombuseSessionId,
        projectId: 'proj-B',
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    expect(agentInvocationsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'session-1',
        project_id: 'proj-A',
      })
    )
  })

  it('resolves runtime project path from persisted session project, not message project', async () => {
    let capturedStartOptions: StartOptions | undefined
    const backend: AgentBackend = {
      name: BACKEND_TYPES.CLAUDE_CODE,
      start: vi.fn(async (options: StartOptions) => {
        capturedStartOptions = options
      }),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      isRunning: vi.fn(() => true),
      getBackendSessionId: vi.fn(() => undefined),
    }
    const deps = createDependencies(backend)

    ;(deps as any).resolveProjectPathForProject = vi.fn((pid: string | null) =>
      pid === 'proj-A' ? '/projects/proj-A' : pid === 'proj-B' ? '/projects/proj-B' : undefined
    )

    ;(deps.sessionPersistence.getSession as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'session-1',
      kombuse_session_id: 'trigger-session-abc',
      backend_type: BACKEND_TYPES.CLAUDE_CODE,
      backend_session_id: 'backend-abc',
      ticket_id: 42,
      project_id: 'proj-A',
      agent_id: 'ticket-analyzer',
      status: 'completed',
      metadata: {},
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      failed_at: null,
      last_event_seq: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    ;(agentInvocationsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        id: 17,
        agent_id: 'ticket-analyzer',
        trigger_id: 11,
        event_id: 99,
        session_id: 'session-1',
        project_id: 'proj-A',
        kombuse_session_id: 'trigger-session-abc',
        status: 'completed',
        attempts: 1,
        max_attempts: 3,
        run_at: new Date().toISOString(),
        context: {},
        result: null,
        error: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ])

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'resume this session',
        kombuseSessionId: 'trigger-session-abc' as KombuseSessionId,
        projectId: 'proj-B',
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    expect((deps as any).resolveProjectPathForProject).toHaveBeenCalledWith('proj-A')
    expect(capturedStartOptions?.projectPath).toBe('/projects/proj-A')
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
      stateMachine: {
        transition: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        setMetadata: vi.fn(),
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
    system_prompt: 'You are a read-only ticket analyzer. Do not modify any files.',
    is_enabled: true,
    config: { type: 'coder' },
    permissions: {},
    plugin_id: null,
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

  it('resolves agent from session.agent_id when no invocations exist', async () => {
    ;(agentInvocationsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([])

    const { backend, getCapturedOptions } = createMockBackend()
    const deps = createMockDependencies(backend, { 'ticket-analyzer': coderAgent })

    // Mock getSessionByKombuseId to return a session with agent_id
    ;(deps.sessionPersistence.getSessionByKombuseId as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'session-1',
      agent_id: 'ticket-analyzer',
      status: 'completed',
      backend_session_id: null,
      ticket_id: null,
    })

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'hello from user chat',
        kombuseSessionId: 'chat-user-session' as KombuseSessionId,
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    expect(deps.getAgent).toHaveBeenCalledWith('ticket-analyzer')

    const expectedTools = presetToAllowedTools(getTypePreset('coder'))
    expect(
      getCapturedOptions()?.allowedTools,
      'should use coder preset tools from session.agent_id resolution'
    ).toEqual(expectedTools)

    expect(
      getCapturedOptions()?.systemPrompt,
      'should render preamble for agent resolved from session.agent_id'
    ).toBeDefined()
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
      stateMachine: {
        transition: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        setMetadata: vi.fn(),
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
      stateMachine: {
        transition: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        setMetadata: vi.fn(),
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

describe('startAgentChatSession resume-failed retry', () => {
  type EventCallback = (event: AgentEvent) => void

  function createEventDrivenBackend() {
    let eventCallback: EventCallback | undefined
    let capturedOptions: StartOptions | undefined
    const backend: AgentBackend = {
      name: 'claude-code' as const,
      start: vi.fn(async (options: StartOptions) => {
        capturedOptions = options
      }),
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
    return { backend, fireEvent, getCapturedOptions: () => capturedOptions }
  }

  const testAgent = {
    id: 'test-agent',
    name: 'Test Agent',
    system_prompt: 'You are helpful.',
    is_enabled: true,
    config: { type: 'coder' },
    permissions: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const mockInvocation = {
    id: 1,
    agent_id: 'test-agent',
    trigger_id: 1,
    event_id: null,
    session_id: null,
    kombuse_session_id: 'trigger-retry-abc',
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

  beforeEach(() => {
    vi.mocked(commentsRepository.create).mockClear()
    vi.mocked(commentsRepository.list).mockReturnValue([])
  })

  it('retries without --resume and injects conversation history on resumeFailed', async () => {
    const primary = createEventDrivenBackend()
    const retry = createEventDrivenBackend()

    let backendCallCount = 0
    const deps = {
      getAgent: vi.fn(() => testAgent),
      processEvent: vi.fn(() => []),
      createBackend: vi.fn(() => {
        backendCallCount++
        return backendCallCount === 1 ? primary.backend : retry.backend
      }),
      generateSessionId: vi.fn(() => 'trigger-retry-abc' as KombuseSessionId),
      resolveProjectPath: vi.fn(() => '/tmp'),
      sessionPersistence: {
        ensureSession: vi.fn(() => 'session-1'),
        getSession: vi.fn(() => ({
          id: 'session-1',
          status: 'completed',
          backend_session_id: 'backend-abc',
          ticket_id: 42,
        })),
        markSessionRunning: vi.fn(),
        persistEvent: vi.fn(),
        completeSession: vi.fn(),
        failSession: vi.fn(),
        getSessionByKombuseId: vi.fn(() => null),
        getSessionEvents: vi.fn(() => [
          {
            id: 1,
            session_id: 'session-1',
            seq: 1,
            event_type: 'message',
            payload: { type: 'message', role: 'user', content: 'What is the color of?' },
            created_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 2,
            session_id: 'session-1',
            seq: 2,
            event_type: 'message',
            payload: { type: 'message', role: 'assistant', content: '?' },
            created_at: '2026-01-01T00:00:01Z',
          },
        ]),
      },
      stateMachine: {
        transition: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        setMetadata: vi.fn(),
      },
    }

    ;(agentInvocationsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([mockInvocation])

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'sky',
        kombuseSessionId: 'trigger-retry-abc' as KombuseSessionId,
      },
      () => {},
      deps as any,
      { ticketId: 42 },
    )

    await waitForBackendStart(primary.backend)

    // Primary backend should have --resume
    expect(primary.getCapturedOptions()?.resumeSessionId).toBe('backend-abc')

    // Simulate resume failure
    primary.fireEvent({
      type: 'complete',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      reason: 'result',
      success: false,
      resumeFailed: true,
      errorMessage: 'Session does not exist',
    })

    // Wait for retry backend to start
    await waitForBackendStart(retry.backend)

    // Retry backend should NOT have --resume
    expect(
      retry.getCapturedOptions()?.resumeSessionId,
      'retry should not pass resumeSessionId'
    ).toBeUndefined()

    // createBackend should have been called twice (primary + retry)
    expect(deps.createBackend).toHaveBeenCalledTimes(2)

    // Retry backend should have conversation history injected
    const retryPrompt = retry.getCapturedOptions()?.systemPrompt ?? ''
    expect(retryPrompt).toContain('## Prior Conversation')
    expect(retryPrompt).toContain('What is the color of?')
    expect(retryPrompt).toContain('?')

    // Complete the retry successfully
    retry.fireEvent({
      type: 'complete',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      reason: 'result',
      success: true,
    })

    // Session should be transitioned to complete via state machine
    expect(deps.stateMachine.transition).toHaveBeenCalledWith(
      'session-1', 'complete', expect.objectContaining({ kombuseSessionId: 'trigger-retry-abc' })
    )
  })
})

describe('persistent backend reuse', () => {
  type EventCallback = (event: AgentEvent) => void

  function createEventDrivenBackend() {
    const subscribers: EventCallback[] = []
    let capturedOptions: StartOptions | undefined
    const backend: AgentBackend = {
      name: 'claude-code' as const,
      start: vi.fn(async (options: StartOptions) => {
        capturedOptions = options
      }),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn((cb: EventCallback) => {
        subscribers.push(cb)
        return () => {
          const idx = subscribers.indexOf(cb)
          if (idx >= 0) subscribers.splice(idx, 1)
        }
      }),
      isRunning: vi.fn(() => true),
      getBackendSessionId: vi.fn(() => 'backend-session-1'),
    }
    const fireEvent = (event: AgentEvent) => {
      // Copy array to avoid issues if subscribers unsubscribe during iteration
      for (const cb of [...subscribers]) cb(event)
    }
    return { backend, fireEvent, getCapturedOptions: () => capturedOptions }
  }

  const testAgent = {
    id: 'test-agent',
    name: 'Test Agent',
    system_prompt: 'You are helpful.',
    is_enabled: true,
    config: { type: 'kombuse' },
    permissions: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  it('reuses existing active backend for same session instead of creating new one', async () => {
    const { backend, fireEvent } = createEventDrivenBackend()

    const deps = {
      getAgent: vi.fn(() => testAgent),
      processEvent: vi.fn(() => []),
      createBackend: vi.fn(() => backend),
      generateSessionId: vi.fn(() => 'persistent-test' as KombuseSessionId),
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
      stateMachine: {
        transition: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        setMetadata: vi.fn(),
      },
    }

    // First invocation — should create a new backend
    const emit1 = vi.fn()
    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'hello',
        kombuseSessionId: 'persistent-test' as KombuseSessionId,
      },
      emit1,
      deps as any,
    )

    await waitForBackendStart(backend)
    expect(deps.createBackend).toHaveBeenCalledTimes(1)

    // Manually register backend in activeBackends (state machine mock is no-op)
    registerBackend('persistent-test', backend)

    // Complete first turn — backend stays alive
    fireEvent({
      type: 'complete',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      reason: 'result',
      success: true,
    })

    // Backend should still be running (mock always returns true)
    expect(backend.isRunning()).toBe(true)

    // Second invocation with same kombuseSessionId — should reuse backend
    const emit2 = vi.fn()
    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'follow-up',
        kombuseSessionId: 'persistent-test' as KombuseSessionId,
      },
      emit2,
      deps as any,
    )

    // Should NOT have created a second backend
    expect(deps.createBackend).toHaveBeenCalledTimes(1)
    // Should have called send() with the follow-up message
    expect(backend.send).toHaveBeenCalledWith('follow-up', undefined)
  })

  it('creates new backend when existing backend is not running', async () => {
    const primary = createEventDrivenBackend()
    const secondary = createEventDrivenBackend()

    let backendCallCount = 0
    const deps = {
      getAgent: vi.fn(() => testAgent),
      processEvent: vi.fn(() => []),
      createBackend: vi.fn(() => {
        backendCallCount++
        return backendCallCount === 1 ? primary.backend : secondary.backend
      }),
      generateSessionId: vi.fn(() => 'persistent-fallthrough' as KombuseSessionId),
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
      stateMachine: {
        transition: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        setMetadata: vi.fn(),
      },
    }

    // First invocation
    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'hello',
        kombuseSessionId: 'persistent-fallthrough' as KombuseSessionId,
      },
      vi.fn(),
      deps as any,
    )

    await waitForBackendStart(primary.backend)

    // Complete first turn
    primary.fireEvent({
      type: 'complete',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      reason: 'result',
      success: true,
    })

    // Simulate the backend process dying — isRunning now returns false
    vi.mocked(primary.backend.isRunning).mockReturnValue(false)

    // Second invocation — backend is not running so should fall through to new backend
    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'follow-up after crash',
        kombuseSessionId: 'persistent-fallthrough' as KombuseSessionId,
      },
      vi.fn(),
      deps as any,
    )

    await waitForBackendStart(secondary.backend)

    // Should have created a second backend
    expect(deps.createBackend).toHaveBeenCalledTimes(2)
    // send() should NOT have been called on the dead primary backend
    expect(primary.backend.send).not.toHaveBeenCalled()
  })
})

describe('user stop lifecycle integration', () => {
  type EventCallback = (event: AgentEvent) => void

  function createStoppableBackend() {
    const subscribers: EventCallback[] = []
    let running = false

    const backend: AgentBackend = {
      name: 'claude-code' as const,
      start: vi.fn(async () => {
        running = true
      }),
      stop: vi.fn(async () => {
        if (!running) return
        running = false
        const completeEvent: AgentEvent = {
          type: 'complete',
          eventId: crypto.randomUUID(),
          backend: 'claude-code',
          timestamp: Date.now(),
          reason: 'stopped',
          success: false,
          errorMessage: 'Stopped by user',
        }
        for (const callback of [...subscribers]) {
          callback(completeEvent)
        }
      }),
      send: vi.fn(),
      subscribe: vi.fn((callback: EventCallback) => {
        subscribers.push(callback)
        return () => {
          const idx = subscribers.indexOf(callback)
          if (idx >= 0) subscribers.splice(idx, 1)
        }
      }),
      isRunning: vi.fn(() => running),
      getBackendSessionId: vi.fn(() => 'backend-session-1'),
    }

    return { backend }
  }

  function createStartupStoppableBackend() {
    const subscribers: EventCallback[] = []
    let running = false
    let stopRequested = false
    let releaseStartup: (() => void) | undefined

    const startupBarrier = new Promise<void>((resolve) => {
      releaseStartup = resolve
    })

    const backend: AgentBackend = {
      name: 'claude-code' as const,
      start: vi.fn(async () => {
        await startupBarrier
        if (stopRequested) {
          throw new Error('Stopped during startup')
        }
        running = true
      }),
      stop: vi.fn(async () => {
        stopRequested = true
        running = false
        releaseStartup?.()
        const completeEvent: AgentEvent = {
          type: 'complete',
          eventId: crypto.randomUUID(),
          backend: 'claude-code',
          timestamp: Date.now(),
          reason: 'stopped',
          success: false,
          errorMessage: 'Stopped by user',
        }
        for (const callback of [...subscribers]) {
          callback(completeEvent)
        }
      }),
      send: vi.fn(),
      subscribe: vi.fn((callback: EventCallback) => {
        subscribers.push(callback)
        return () => {
          const idx = subscribers.indexOf(callback)
          if (idx >= 0) subscribers.splice(idx, 1)
        }
      }),
      isRunning: vi.fn(() => running),
      getBackendSessionId: vi.fn(() => 'backend-session-1'),
    }

    return { backend }
  }

  it('emits a single aborted completion and abort transition on user stop', async () => {
    const { backend } = createStoppableBackend()

    const deps = {
      getAgent: vi.fn(() => null),
      processEvent: vi.fn(() => []),
      createBackend: vi.fn(() => backend),
      generateSessionId: vi.fn(() => 'stop-flow-test' as KombuseSessionId),
      resolveProjectPath: vi.fn(() => '/tmp'),
      sessionPersistence: {
        ensureSession: vi.fn(() => 'session-1'),
        getSession: vi.fn(() => ({
          id: 'session-1',
          kombuse_session_id: 'stop-flow-test',
          backend_type: BACKEND_TYPES.CLAUDE_CODE,
          backend_session_id: null,
          ticket_id: null,
          agent_id: null,
          status: 'pending',
          metadata: {},
          started_at: new Date().toISOString(),
          completed_at: null,
          failed_at: null,
          aborted_at: null,
          last_event_seq: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
        markSessionRunning: vi.fn(),
        persistEvent: vi.fn(),
        completeSession: vi.fn(),
        failSession: vi.fn(),
        getSessionByKombuseId: vi.fn(() => null),
        getSessionEvents: vi.fn(() => []),
      },
      stateMachine: {
        transition: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        setMetadata: vi.fn(),
      },
    }

    const emittedEvents: AgentExecutionEvent[] = []

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'stop me',
        kombuseSessionId: 'stop-flow-test' as KombuseSessionId,
      },
      (event) => emittedEvents.push(event),
      deps as any
    )

    await waitForBackendStart(backend)
    registerBackend('stop-flow-test', backend)

    expect(stopAgentSession('stop-flow-test')).toBe(true)

    const completionEvents = emittedEvents.filter(
      (event): event is Extract<AgentExecutionEvent, { type: 'complete' }> => event.type === 'complete'
    )

    expect(completionEvents).toHaveLength(1)
    expect(completionEvents[0]).toMatchObject({
      kombuseSessionId: 'stop-flow-test',
      status: 'aborted',
      reason: 'user_stop',
      errorMessage: 'Stopped by user',
    })
    expect(completionEvents.every((event) => event.status !== 'failed')).toBe(true)
    expect(deps.stateMachine.transition).toHaveBeenCalledWith(
      'session-1',
      'abort',
      expect.objectContaining({
        kombuseSessionId: 'stop-flow-test',
      })
    )
  })

  it('stops an in-flight startup and still emits a single aborted completion', async () => {
    const { backend } = createStartupStoppableBackend()

    const deps = {
      getAgent: vi.fn(() => null),
      processEvent: vi.fn(() => []),
      createBackend: vi.fn(() => backend),
      generateSessionId: vi.fn(() => 'stop-during-startup-test' as KombuseSessionId),
      resolveProjectPath: vi.fn(() => '/tmp'),
      sessionPersistence: {
        ensureSession: vi.fn(() => 'session-1'),
        getSession: vi.fn(() => ({
          id: 'session-1',
          kombuse_session_id: 'stop-during-startup-test',
          backend_type: BACKEND_TYPES.CLAUDE_CODE,
          backend_session_id: null,
          ticket_id: null,
          agent_id: null,
          status: 'pending',
          metadata: {},
          started_at: new Date().toISOString(),
          completed_at: null,
          failed_at: null,
          aborted_at: null,
          last_event_seq: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
        markSessionRunning: vi.fn(),
        persistEvent: vi.fn(),
        completeSession: vi.fn(),
        failSession: vi.fn(),
        getSessionByKombuseId: vi.fn(() => null),
        getSessionEvents: vi.fn(() => []),
      },
      stateMachine: {
        transition: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        setMetadata: vi.fn(),
      },
    }

    const emittedEvents: AgentExecutionEvent[] = []

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'stop while starting',
        kombuseSessionId: 'stop-during-startup-test' as KombuseSessionId,
      },
      (event) => emittedEvents.push(event),
      deps as any
    )

    await waitForBackendStart(backend)
    registerBackend('stop-during-startup-test', backend)

    expect(stopAgentSession('stop-during-startup-test')).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const completionEvents = emittedEvents.filter(
      (event): event is Extract<AgentExecutionEvent, { type: 'complete' }> => event.type === 'complete'
    )
    const failTransitions = deps.stateMachine.transition.mock.calls.filter((call) => call[1] === 'fail')

    expect(backend.stop).toHaveBeenCalledTimes(1)
    expect(completionEvents).toHaveLength(1)
    expect(completionEvents[0]).toMatchObject({
      kombuseSessionId: 'stop-during-startup-test',
      status: 'aborted',
      reason: 'user_stop',
      errorMessage: 'Stopped by user',
    })
    expect(failTransitions).toHaveLength(0)
  })
})

describe('startup failure deduplication', () => {
  type EventCallback = (event: AgentEvent) => void

  function createFailingStartupBackend() {
    const subscribers: EventCallback[] = []

    const backend: AgentBackend = {
      name: 'claude-code' as const,
      start: vi.fn(async () => {
        const completeEvent: AgentEvent = {
          type: 'complete',
          eventId: crypto.randomUUID(),
          backend: 'claude-code',
          timestamp: Date.now(),
          reason: 'failed',
          success: false,
          errorMessage: 'startup exploded',
        }
        for (const callback of [...subscribers]) {
          callback(completeEvent)
        }
        throw new Error('startup exploded')
      }),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn((callback: EventCallback) => {
        subscribers.push(callback)
        return () => {
          const idx = subscribers.indexOf(callback)
          if (idx >= 0) subscribers.splice(idx, 1)
        }
      }),
      isRunning: vi.fn(() => false),
      getBackendSessionId: vi.fn(() => 'backend-session-1'),
    }

    return { backend }
  }

  it('handles startup failure through a single terminal path', async () => {
    const { backend } = createFailingStartupBackend()

    const deps = {
      getAgent: vi.fn(() => null),
      processEvent: vi.fn(() => []),
      createBackend: vi.fn(() => backend),
      generateSessionId: vi.fn(() => 'startup-failure-test' as KombuseSessionId),
      resolveProjectPath: vi.fn(() => '/tmp'),
      sessionPersistence: {
        ensureSession: vi.fn(() => 'session-1'),
        getSession: vi.fn(() => ({
          id: 'session-1',
          kombuse_session_id: 'startup-failure-test',
          backend_type: BACKEND_TYPES.CLAUDE_CODE,
          backend_session_id: null,
          ticket_id: null,
          agent_id: null,
          status: 'pending',
          metadata: {},
          started_at: new Date().toISOString(),
          completed_at: null,
          failed_at: null,
          aborted_at: null,
          last_event_seq: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
        markSessionRunning: vi.fn(),
        persistEvent: vi.fn(),
        completeSession: vi.fn(),
        failSession: vi.fn(),
        getSessionByKombuseId: vi.fn(() => null),
        getSessionEvents: vi.fn(() => []),
      },
      stateMachine: {
        transition: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        setMetadata: vi.fn(),
      },
    }

    const emittedEvents: AgentExecutionEvent[] = []

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        message: 'start and fail',
        kombuseSessionId: 'startup-failure-test' as KombuseSessionId,
      },
      (event) => emittedEvents.push(event),
      deps as any
    )

    await waitForBackendStart(backend)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const completionEvents = emittedEvents.filter(
      (event): event is Extract<AgentExecutionEvent, { type: 'complete' }> => event.type === 'complete'
    )
    const failTransitions = deps.stateMachine.transition.mock.calls.filter((call) => call[1] === 'fail')

    expect(completionEvents).toHaveLength(1)
    expect(completionEvents[0]).toMatchObject({
      kombuseSessionId: 'startup-failure-test',
      status: 'failed',
      errorMessage: 'startup exploded',
    })
    expect(failTransitions).toHaveLength(1)
  })
})

describe('cleanupOrphanedSessions broadcasts agent.complete', () => {
  beforeEach(() => {
    vi.mocked(wsHub.broadcastAgentMessage).mockClear()
    vi.mocked(wsHub.broadcastToTopic).mockClear()
    vi.mocked(sessionsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([])
    vi.mocked(sessionsRepository.update as ReturnType<typeof vi.fn>).mockReturnValue(undefined)
    vi.mocked(sessionsRepository.listByTicket as ReturnType<typeof vi.fn>).mockReturnValue([])
    vi.mocked(agentInvocationsRepository.failBySessionId as ReturnType<typeof vi.fn>).mockClear()
  })

  it('broadcasts agent.complete for each orphaned session', () => {
    const orphanedSessions = [
      {
        id: 'session-1',
        kombuse_session_id: 'orphan-session-aaa',
        ticket_id: 42,
        ticket_number: 42,
        project_id: '1',
        status: 'running',
      },
      {
        id: 'session-2',
        kombuse_session_id: 'orphan-session-bbb',
        ticket_id: null,
        status: 'running',
      },
    ]
    // cleanupOrphanedSessions calls list() for 'running' then 'pending'
    vi.mocked(sessionsRepository.list as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(orphanedSessions)
      .mockReturnValueOnce([])

    vi.mocked(ticketsRepository._getInternal).mockImplementation((ticketId: number) => {
      if (ticketId === 42) return { ticket_number: 42, project_id: '1' } as any
      return null
    })

    const deps = {
      sessionPersistence: {
        persistEvent: vi.fn(),
        abortSession: vi.fn(),
        setMetadata: vi.fn(),
      },
      stateMachine: {
        transition: vi.fn(),
      },
    }

    const cleaned = cleanupOrphanedSessions({}, deps as any)

    expect(cleaned).toBe(2)

    expect(wsHub.broadcastAgentMessage).toHaveBeenCalledWith(
      'orphan-session-aaa',
      expect.objectContaining({
        type: 'agent.complete',
        kombuseSessionId: 'orphan-session-aaa',
        ticketNumber: 42,
      })
    )
    expect(wsHub.broadcastToTopic).toHaveBeenCalledWith('*',
      expect.objectContaining({
        type: 'agent.complete',
        kombuseSessionId: 'orphan-session-aaa',
        ticketNumber: 42,
      })
    )
    expect(wsHub.broadcastAgentMessage).toHaveBeenCalledWith(
      'orphan-session-bbb',
      expect.objectContaining({
        type: 'agent.complete',
        kombuseSessionId: 'orphan-session-bbb',
      })
    )
    expect(wsHub.broadcastToTopic).toHaveBeenCalledWith('*',
      expect.objectContaining({
        type: 'agent.complete',
        kombuseSessionId: 'orphan-session-bbb',
      })
    )
    expect(agentInvocationsRepository.failBySessionId).toHaveBeenCalledWith(
      'session-1',
      'backend_unavailable',
    )
    expect(agentInvocationsRepository.failBySessionId).toHaveBeenCalledWith(
      'session-2',
      'backend_unavailable',
    )
  })

  it('does not broadcast when no orphaned sessions exist', () => {
    vi.mocked(sessionsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([])

    const cleaned = cleanupOrphanedSessions({}, {
      sessionPersistence: {
        persistEvent: vi.fn(),
        abortSession: vi.fn(),
        setMetadata: vi.fn(),
      },
      stateMachine: {
        transition: vi.fn(),
      },
    } as any)

    expect(cleaned).toBe(0)
    expect(wsHub.broadcastAgentMessage).not.toHaveBeenCalled()
  })

  it('skips recently updated orphaned sessions until inactivity threshold', () => {
    const recentSession = {
      id: 'session-recent',
      kombuse_session_id: 'recent-session-aaa',
      ticket_id: 99,
      status: 'running',
      updated_at: new Date().toISOString(),
    }

    vi.mocked(sessionsRepository.list as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce([recentSession])
      .mockReturnValueOnce([])

    const deps = {
      sessionPersistence: {
        persistEvent: vi.fn(),
        abortSession: vi.fn(),
        setMetadata: vi.fn(),
      },
      stateMachine: {
        transition: vi.fn(),
      },
    }

    const cleaned = cleanupOrphanedSessions({ minInactiveMs: 60_000 }, deps as any)

    expect(cleaned).toBe(0)
    expect(deps.stateMachine.transition).not.toHaveBeenCalled()
    expect(wsHub.broadcastAgentMessage).not.toHaveBeenCalled()
    expect(wsHub.broadcastToTopic).not.toHaveBeenCalled()
  })

  it('cleans recently updated orphaned sessions during startup recovery', () => {
    const recentRunningSession = {
      id: 'session-running-recent',
      kombuse_session_id: 'running-recent-session',
      ticket_id: 55,
      status: 'running',
      updated_at: new Date().toISOString(),
    }

    const recentPendingSession = {
      id: 'session-pending-recent',
      kombuse_session_id: 'pending-recent-session',
      ticket_id: 56,
      status: 'pending',
      updated_at: new Date().toISOString(),
    }

    vi.mocked(sessionsRepository.list as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce([recentRunningSession])
      .mockReturnValueOnce([recentPendingSession])

    const deps = {
      sessionPersistence: {
        persistEvent: vi.fn(),
        abortSession: vi.fn(),
        setMetadata: vi.fn(),
      },
      stateMachine: {
        transition: vi.fn(),
      },
    }

    const cleaned = cleanupOrphanedSessions({
      source: 'startup_cleanup',
      reason: 'server_startup_recovery',
      minInactiveMs: 0,
    }, deps as any)

    expect(cleaned).toBe(2)
    expect(deps.stateMachine.transition).toHaveBeenCalledWith(
      'session-running-recent',
      'abort',
      expect.objectContaining({
        kombuseSessionId: 'running-recent-session',
        ticketId: 55,
        error: 'server_startup_recovery',
      })
    )
    expect(deps.stateMachine.transition).toHaveBeenCalledWith(
      'session-pending-recent',
      'abort',
      expect.objectContaining({
        kombuseSessionId: 'pending-recent-session',
        ticketId: 56,
        error: 'server_startup_recovery',
      })
    )
    expect(wsHub.broadcastAgentMessage).toHaveBeenCalledWith(
      'running-recent-session',
      expect.objectContaining({
        type: 'agent.complete',
        kombuseSessionId: 'running-recent-session',
        status: 'aborted',
        reason: 'server_startup_recovery',
      })
    )
    expect(wsHub.broadcastAgentMessage).toHaveBeenCalledWith(
      'pending-recent-session',
      expect.objectContaining({
        type: 'agent.complete',
        kombuseSessionId: 'pending-recent-session',
        status: 'aborted',
        reason: 'server_startup_recovery',
      })
    )
    expect(wsHub.broadcastToTopic).toHaveBeenCalledWith(
      '*',
      expect.objectContaining({
        type: 'agent.complete',
        status: 'aborted',
        reason: 'server_startup_recovery',
      })
    )
  })

  it('fails linked invocations for each aborted session during startup cleanup', () => {
    const orphanedSession = {
      id: 'session-startup',
      kombuse_session_id: 'startup-orphan',
      ticket_id: 10,
      status: 'running',
      updated_at: new Date().toISOString(),
    }

    vi.mocked(sessionsRepository.list as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce([orphanedSession])
      .mockReturnValueOnce([])

    const deps = {
      sessionPersistence: {
        persistEvent: vi.fn(),
        abortSession: vi.fn(),
        setMetadata: vi.fn(),
      },
      stateMachine: {
        transition: vi.fn(),
      },
    }

    cleanupOrphanedSessions({
      source: 'startup_cleanup',
      reason: 'server_startup_recovery',
      minInactiveMs: 0,
    }, deps as any)

    expect(agentInvocationsRepository.failBySessionId).toHaveBeenCalledWith(
      'session-startup',
      'server_startup_recovery',
    )
  })
})

describe('cli_pre_normalization event filtering', () => {
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
      generateSessionId: vi.fn(() => 'chat-pre-norm-id' as KombuseSessionId),
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
      stateMachine: {
        transition: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        setMetadata: vi.fn(),
      },
    }
  }

  function makePreNormEvent(): AgentEvent {
    return {
      type: 'raw',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      sourceType: 'cli_pre_normalization',
      data: { big: 'payload' },
    }
  }

  function makeOtherRawEvent(): AgentEvent {
    return {
      type: 'raw',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      sourceType: 'thinking',
      data: { thought: 'something' },
    }
  }

  const originalLogLevel = process.env.KOMBUSE_LOG_LEVEL

  afterEach(() => {
    if (originalLogLevel === undefined) {
      delete process.env.KOMBUSE_LOG_LEVEL
    } else {
      process.env.KOMBUSE_LOG_LEVEL = originalLogLevel
    }
  })

  beforeEach(() => {
    vi.mocked(createSessionLogger).mockClear()
  })

  it('logs cli_pre_normalization events but does not persist or emit them', async () => {
    delete process.env.KOMBUSE_LOG_LEVEL
    const { backend, fireEvent } = createEventDrivenBackend()
    const deps = createDeps(backend)
    const emitSpy = vi.fn()

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'hello',
        kombuseSessionId: 'chat-pre-norm-id' as KombuseSessionId,
      },
      emitSpy,
      deps as any,
    )

    await waitForBackendStart(backend)

    // Reset after setup (user message is persisted before onEvent is wired)
    deps.sessionPersistence.persistEvent.mockClear()
    emitSpy.mockClear()

    fireEvent(makePreNormEvent())

    const loggerInstance = vi.mocked(createSessionLogger).mock.results[0]?.value
    expect(loggerInstance.logEvent).toHaveBeenCalled()
    expect(deps.sessionPersistence.persistEvent).not.toHaveBeenCalled()
    expect(emitSpy).not.toHaveBeenCalled()
  })

  it('passes raw events with other sourceTypes through normally', async () => {
    delete process.env.KOMBUSE_LOG_LEVEL
    const { backend, fireEvent } = createEventDrivenBackend()
    const deps = createDeps(backend)
    const emitSpy = vi.fn()

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'hello',
        kombuseSessionId: 'chat-pre-norm-id' as KombuseSessionId,
      },
      emitSpy,
      deps as any,
    )

    await waitForBackendStart(backend)

    deps.sessionPersistence.persistEvent.mockClear()
    emitSpy.mockClear()

    fireEvent(makeOtherRawEvent())

    const loggerInstance = vi.mocked(createSessionLogger).mock.results[0]?.value
    expect(loggerInstance.logEvent).toHaveBeenCalled()
    expect(deps.sessionPersistence.persistEvent).toHaveBeenCalledOnce()
    expect(emitSpy).toHaveBeenCalledOnce()
  })

  it('persists cli_pre_normalization events when KOMBUSE_LOG_LEVEL=debug', async () => {
    process.env.KOMBUSE_LOG_LEVEL = 'debug'
    const { backend, fireEvent } = createEventDrivenBackend()
    const deps = createDeps(backend)
    const emitSpy = vi.fn()

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'hello',
        kombuseSessionId: 'chat-pre-norm-id' as KombuseSessionId,
      },
      emitSpy,
      deps as any,
    )

    await waitForBackendStart(backend)

    deps.sessionPersistence.persistEvent.mockClear()
    emitSpy.mockClear()

    fireEvent(makePreNormEvent())

    const loggerInstance = vi.mocked(createSessionLogger).mock.results[0]?.value
    expect(loggerInstance.logEvent).toHaveBeenCalled()
    expect(deps.sessionPersistence.persistEvent).toHaveBeenCalledOnce()
    expect(emitSpy).toHaveBeenCalledOnce()
  })
})

describe('continuation invocation tracking', () => {
  type EventCallback = (event: AgentEvent) => void

  function createEventDrivenBackend() {
    const subscribers: EventCallback[] = []
    const backend: AgentBackend = {
      name: 'claude-code' as const,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn((cb: EventCallback) => {
        subscribers.push(cb)
        return () => {
          const idx = subscribers.indexOf(cb)
          if (idx >= 0) subscribers.splice(idx, 1)
        }
      }),
      isRunning: vi.fn(() => true),
      getBackendSessionId: vi.fn(() => 'backend-session-1'),
    }
    const fireEvent = (event: AgentEvent) => {
      for (const cb of [...subscribers]) cb(event)
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

  const failedInvocation = {
    id: 1,
    agent_id: 'test-agent',
    trigger_id: 5,
    event_id: 10,
    session_id: null,
    project_id: '1',
    kombuse_session_id: 'trigger-continue-test',
    status: 'failed' as const,
    attempts: 1,
    max_attempts: 3,
    run_at: new Date().toISOString(),
    context: { ticket_id: 42, project_id: '1' },
    result: null,
    error: 'error_max_turns',
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }

  function createDeps(backend: AgentBackend) {
    return {
      getAgent: vi.fn(() => testAgent),
      processEvent: vi.fn(() => []),
      createBackend: vi.fn(() => backend),
      generateSessionId: vi.fn(() => 'trigger-continue-test' as KombuseSessionId),
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
      stateMachine: {
        transition: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        setMetadata: vi.fn(),
      },
    }
  }

  beforeEach(() => {
    vi.mocked(agentInvocationsRepository.list).mockReset()
    vi.mocked(agentInvocationsRepository.list).mockReturnValue([])
    vi.mocked(agentInvocationsRepository.create).mockClear()
    vi.mocked(agentInvocationsRepository.update).mockClear()
  })

  it('creates a continuation invocation when last invocation is failed', async () => {
    vi.mocked(agentInvocationsRepository.list).mockReturnValue([failedInvocation])

    const { backend } = createEventDrivenBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'continue',
        kombuseSessionId: 'trigger-continue-test' as KombuseSessionId,
      },
      vi.fn(),
      deps as any,
    )

    await waitForBackendStart(backend)

    expect(agentInvocationsRepository.create).toHaveBeenCalledOnce()
    expect(agentInvocationsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: 'test-agent',
        trigger_id: 5,
        event_id: 10,
        session_id: 'session-1',
        project_id: '1',
        context: { ticket_id: 42, project_id: '1' },
      })
    )
    // Should be updated to running
    expect(agentInvocationsRepository.update).toHaveBeenCalledWith(
      100, // mock create returns id: 100
      expect.objectContaining({
        kombuse_session_id: 'trigger-continue-test',
        status: 'running',
      })
    )
  })

  it('creates a continuation invocation when last invocation is completed', async () => {
    const completedInvocation = { ...failedInvocation, status: 'completed' as const, error: null }
    vi.mocked(agentInvocationsRepository.list).mockReturnValue([completedInvocation])

    const { backend } = createEventDrivenBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'follow up',
        kombuseSessionId: 'trigger-continue-test' as KombuseSessionId,
      },
      vi.fn(),
      deps as any,
    )

    await waitForBackendStart(backend)

    expect(agentInvocationsRepository.create).toHaveBeenCalledOnce()
  })

  it('marks continuation invocation completed when agent completes', async () => {
    vi.mocked(agentInvocationsRepository.list).mockReturnValue([failedInvocation])

    const { backend, fireEvent } = createEventDrivenBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'continue',
        kombuseSessionId: 'trigger-continue-test' as KombuseSessionId,
      },
      vi.fn(),
      deps as any,
    )

    await waitForBackendStart(backend)

    // Clear setup transitions
    deps.stateMachine.transition.mockClear()

    // Fire complete event
    fireEvent({
      type: 'complete',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      reason: 'result',
      success: true,
    })

    // State machine handles invocation completion via its invocations dep
    expect(deps.stateMachine.transition).toHaveBeenCalledWith(
      'session-1', 'complete', expect.objectContaining({ invocationId: 100 })
    )
  })

  it('marks continuation invocation failed when agent errors', async () => {
    vi.mocked(agentInvocationsRepository.list).mockReturnValue([failedInvocation])

    const { backend, fireEvent } = createEventDrivenBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'continue',
        kombuseSessionId: 'trigger-continue-test' as KombuseSessionId,
      },
      vi.fn(),
      deps as any,
    )

    await waitForBackendStart(backend)

    deps.stateMachine.transition.mockClear()

    // Fire error event
    fireEvent({
      type: 'complete',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      reason: 'result',
      success: false,
      errorMessage: 'error_max_turns',
    })

    // State machine handles invocation failure via its invocations dep
    expect(deps.stateMachine.transition).toHaveBeenCalledWith(
      'session-1', 'fail', expect.objectContaining({ invocationId: 100 })
    )
  })

  it('creates an initial chat invocation when no prior invocations exist', async () => {
    vi.mocked(agentInvocationsRepository.list).mockReturnValue([])

    const { backend } = createEventDrivenBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'hello',
        kombuseSessionId: 'trigger-continue-test' as KombuseSessionId,
      },
      vi.fn(),
      deps as any,
    )

    await waitForBackendStart(backend)

    expect(agentInvocationsRepository.create).toHaveBeenCalledOnce()
    expect(agentInvocationsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: 'test-agent',
        session_id: 'session-1',
        context: expect.objectContaining({ event_type: 'chat.started' }),
      })
    )
    expect(agentInvocationsRepository.update).toHaveBeenCalledWith(
      100,
      expect.objectContaining({
        kombuse_session_id: 'trigger-continue-test',
        status: 'running',
      })
    )
  })

  it('does not create continuation when last invocation is still running', async () => {
    const runningInvocation = { ...failedInvocation, status: 'running' as const, error: null, completed_at: null }
    vi.mocked(agentInvocationsRepository.list).mockReturnValue([runningInvocation])

    const { backend } = createEventDrivenBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'hello',
        kombuseSessionId: 'trigger-continue-test' as KombuseSessionId,
      },
      vi.fn(),
      deps as any,
    )

    await waitForBackendStart(backend)

    expect(agentInvocationsRepository.create).not.toHaveBeenCalled()
  })

  it('backfills session_id on invocations with null session_id', async () => {
    const invocationWithNullSessionId = { ...failedInvocation, status: 'running' as const, session_id: null }
    vi.mocked(agentInvocationsRepository.list).mockReturnValue([invocationWithNullSessionId])

    const { backend } = createEventDrivenBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'hello',
        kombuseSessionId: 'trigger-continue-test' as KombuseSessionId,
      },
      vi.fn(),
      deps as any,
    )

    await waitForBackendStart(backend)

    expect(agentInvocationsRepository.update).toHaveBeenCalledWith(
      1, // original invocation id
      expect.objectContaining({
        session_id: 'session-1',
      })
    )
  })

  it('does not backfill session_id when already set', async () => {
    const invocationWithSessionId = { ...failedInvocation, status: 'running' as const, session_id: 'existing-session' }
    vi.mocked(agentInvocationsRepository.list).mockReturnValue([invocationWithSessionId])

    const { backend } = createEventDrivenBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'hello',
        kombuseSessionId: 'trigger-continue-test' as KombuseSessionId,
      },
      vi.fn(),
      deps as any,
    )

    await waitForBackendStart(backend)

    // Should NOT have been called with session_id (only running invocation, no continuation)
    const updateCalls = vi.mocked(agentInvocationsRepository.update).mock.calls
    const sessionIdUpdates = updateCalls.filter(
      ([id, input]) => id === 1 && (input as Record<string, unknown>).session_id !== undefined
    )
    expect(sessionIdUpdates).toHaveLength(0)
  })
})

describe('backend idle timeout broadcasts agent.complete', () => {
  const BACKEND_IDLE_TIMEOUT_MS = 30 * 60 * 1000

  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(wsHub.broadcastAgentMessage).mockClear()
    vi.mocked(wsHub.broadcastToTopic).mockClear()
    vi.mocked(sessionsRepository.update as ReturnType<typeof vi.fn>).mockClear()
    vi.mocked((sessionsRepository as any).get as ReturnType<typeof vi.fn>).mockReturnValue(null)
    vi.mocked((sessionsRepository as any).getByKombuseSessionId as ReturnType<typeof vi.fn>).mockReturnValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
    stopAllActiveBackends()
  })

  it('broadcasts agent.complete when idle timeout fires', () => {
    const mockSession = {
      id: 'session-1',
      kombuse_session_id: 'test-session',
      ticket_id: 42,
      status: 'completed',
      backend_session_id: null,
      backend_type: 'claude-code',
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    // State machine's getSession needs this for the 'stop' transition
    vi.mocked((sessionsRepository as any).get as ReturnType<typeof vi.fn>).mockReturnValue(mockSession)
    // Idle timeout callback looks up session by kombuse ID
    vi.mocked((sessionsRepository as any).getByKombuseSessionId as ReturnType<typeof vi.fn>).mockReturnValue(mockSession)
    // Idle timeout resolves ticket_number from ticket record
    vi.mocked(ticketsRepository._getInternal).mockReturnValue({ ticket_number: 42, project_id: '1' } as any)

    const mockBackend: AgentBackend = {
      name: 'claude-code' as const,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      isRunning: vi.fn(() => false),
      getBackendSessionId: vi.fn(() => undefined),
    }
    registerBackend('test-session', mockBackend)
    resetBackendIdleTimeout('test-session')

    vi.advanceTimersByTime(BACKEND_IDLE_TIMEOUT_MS)

    expect(wsHub.broadcastAgentMessage).toHaveBeenCalledWith(
      'test-session',
      expect.objectContaining({
        type: 'agent.complete',
        kombuseSessionId: 'test-session',
        ticketNumber: 42,
        status: 'stopped',
        reason: 'idle_timeout',
      })
    )
    expect(wsHub.broadcastToTopic).toHaveBeenCalledWith(
      '*',
      expect.objectContaining({
        type: 'agent.complete',
        kombuseSessionId: 'test-session',
        ticketNumber: 42,
        status: 'stopped',
        reason: 'idle_timeout',
      })
    )
  })

  it('transitions session to stopped via state machine', () => {
    const mockSession = {
      id: 'session-1',
      kombuse_session_id: 'test-session',
      ticket_id: 42,
      status: 'completed',
      backend_session_id: null,
      backend_type: 'claude-code',
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    vi.mocked((sessionsRepository as any).get as ReturnType<typeof vi.fn>).mockReturnValue(mockSession)
    vi.mocked((sessionsRepository as any).getByKombuseSessionId as ReturnType<typeof vi.fn>).mockReturnValue(mockSession)

    const mockBackend: AgentBackend = {
      name: 'claude-code' as const,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      isRunning: vi.fn(() => false),
      getBackendSessionId: vi.fn(() => undefined),
    }
    registerBackend('test-session', mockBackend)
    resetBackendIdleTimeout('test-session')

    vi.advanceTimersByTime(BACKEND_IDLE_TIMEOUT_MS)

    // State machine's stop handler calls updateStatus with 'stopped'
    expect(sessionsRepository.update).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ status: 'stopped' })
    )
  })

  it('does not stop or broadcast while the session is still running', () => {
    const mockSession = {
      id: 'session-1',
      kombuse_session_id: 'test-session',
      ticket_id: 42,
      status: 'running',
      backend_session_id: null,
      backend_type: 'claude-code',
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    vi.mocked((sessionsRepository as any).get as ReturnType<typeof vi.fn>).mockReturnValue(mockSession)
    vi.mocked((sessionsRepository as any).getByKombuseSessionId as ReturnType<typeof vi.fn>).mockReturnValue(mockSession)

    const mockBackend: AgentBackend = {
      name: 'claude-code' as const,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      isRunning: vi.fn(() => true),
      getBackendSessionId: vi.fn(() => undefined),
    }
    registerBackend('test-session', mockBackend)
    resetBackendIdleTimeout('test-session')

    vi.advanceTimersByTime(BACKEND_IDLE_TIMEOUT_MS)
    vi.advanceTimersByTime(BACKEND_IDLE_TIMEOUT_MS)

    expect(mockBackend.stop).not.toHaveBeenCalled()
    expect(wsHub.broadcastAgentMessage).not.toHaveBeenCalled()
    expect(wsHub.broadcastToTopic).not.toHaveBeenCalled()
  })

  it('still broadcasts when session is already in terminal state', () => {
    const mockSession = {
      id: 'session-1',
      kombuse_session_id: 'test-session',
      ticket_id: 42,
      status: 'aborted',
      backend_session_id: null,
      backend_type: 'claude-code',
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    vi.mocked((sessionsRepository as any).get as ReturnType<typeof vi.fn>).mockReturnValue(mockSession)
    vi.mocked((sessionsRepository as any).getByKombuseSessionId as ReturnType<typeof vi.fn>).mockReturnValue(mockSession)

    const mockBackend: AgentBackend = {
      name: 'claude-code' as const,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      isRunning: vi.fn(() => false),
      getBackendSessionId: vi.fn(() => undefined),
    }
    registerBackend('test-session', mockBackend)
    resetBackendIdleTimeout('test-session')

    vi.advanceTimersByTime(BACKEND_IDLE_TIMEOUT_MS)

    // Should still broadcast even though the state machine transition threw
    expect(wsHub.broadcastAgentMessage).toHaveBeenCalledWith(
      'test-session',
      expect.objectContaining({
        type: 'agent.complete',
        kombuseSessionId: 'test-session',
        status: 'stopped',
        reason: 'idle_timeout',
      })
    )
  })

  it('does not schedule timeout when user setting is unlimited (empty string)', () => {
    ;(profileSettingsRepository.get as ReturnType<typeof vi.fn>).mockImplementation(
      (_profileId: string, key: string) => {
        if (key === 'chat.backend_idle_timeout_minutes') {
          return { setting_value: '' }
        }
        return null
      }
    )

    const mockBackend: AgentBackend = {
      name: 'claude-code' as const,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      isRunning: vi.fn(() => false),
      getBackendSessionId: vi.fn(() => undefined),
    }
    registerBackend('test-session', mockBackend)
    resetBackendIdleTimeout('test-session')

    expect(backendIdleTimeouts.has('test-session')).toBe(false)

    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(mockBackend.stop).not.toHaveBeenCalled()
    expect(wsHub.broadcastAgentMessage).not.toHaveBeenCalled()

    ;(profileSettingsRepository.get as ReturnType<typeof vi.fn>).mockReset()
    ;(profileSettingsRepository.get as ReturnType<typeof vi.fn>).mockReturnValue(null)
  })

  it('uses user-configured timeout in minutes when set', () => {
    ;(profileSettingsRepository.get as ReturnType<typeof vi.fn>).mockImplementation(
      (_profileId: string, key: string) => {
        if (key === 'chat.backend_idle_timeout_minutes') {
          return { setting_value: '10' }
        }
        return null
      }
    )

    const mockSession = {
      id: 'session-1',
      kombuse_session_id: 'test-session',
      ticket_id: 42,
      status: 'completed',
      backend_session_id: null,
      backend_type: 'claude-code',
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    vi.mocked((sessionsRepository as any).get as ReturnType<typeof vi.fn>).mockReturnValue(mockSession)
    vi.mocked((sessionsRepository as any).getByKombuseSessionId as ReturnType<typeof vi.fn>).mockReturnValue(mockSession)

    const mockBackend: AgentBackend = {
      name: 'claude-code' as const,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      isRunning: vi.fn(() => false),
      getBackendSessionId: vi.fn(() => undefined),
    }
    registerBackend('test-session', mockBackend)
    resetBackendIdleTimeout('test-session')

    // Should not fire at 9 minutes
    vi.advanceTimersByTime(9 * 60 * 1000)
    expect(wsHub.broadcastAgentMessage).not.toHaveBeenCalled()

    // Should fire at 10 minutes
    vi.advanceTimersByTime(1 * 60 * 1000)
    expect(wsHub.broadcastAgentMessage).toHaveBeenCalledWith(
      'test-session',
      expect.objectContaining({
        type: 'agent.complete',
        reason: 'idle_timeout',
      })
    )

    ;(profileSettingsRepository.get as ReturnType<typeof vi.fn>).mockReset()
    ;(profileSettingsRepository.get as ReturnType<typeof vi.fn>).mockReturnValue(null)
  })
})

describe('permission keying for cross-session requestId collisions', () => {
  function makePermissionRequestEvent(requestId: string): Extract<AgentEvent, { type: 'permission_request' }> {
    return {
      type: 'permission_request',
      eventId: crypto.randomUUID(),
      backend: BACKEND_TYPES.CODEX,
      timestamp: Date.now(),
      requestId,
      toolName: 'Bash',
      toolUseId: `tool-${requestId}`,
      input: { command: 'ls' },
    }
  }

  function makePermissionBackend(): AgentBackend {
    return {
      name: BACKEND_TYPES.CODEX,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      respondToPermission: vi.fn(),
      isRunning: vi.fn(() => true),
      getBackendSessionId: vi.fn(() => undefined),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    serverPendingPermissions.clear()
  })

  it('tracks same requestId from different sessions as distinct pending permissions', () => {
    broadcastPermissionPending(
      'chat-session-alpha',
      makePermissionRequestEvent('request-1')
    )
    broadcastPermissionPending(
      'chat-session-beta',
      makePermissionRequestEvent('request-1')
    )

    const pending = getPendingPermissions()
    expect(pending).toHaveLength(2)

    const keys = pending.map((permission) => permission.permissionKey)
    expect(keys).toContain('chat-session-alpha:request-1')
    expect(keys).toContain('chat-session-beta:request-1')
  })

  it('resolves only the targeted session permission when requestId collides', () => {
    const backendAlpha = makePermissionBackend()
    const backendBeta = makePermissionBackend()
    registerBackend('chat-session-alpha', backendAlpha)
    registerBackend('chat-session-beta', backendBeta)

    broadcastPermissionPending(
      'chat-session-alpha',
      makePermissionRequestEvent('request-1')
    )
    broadcastPermissionPending(
      'chat-session-beta',
      makePermissionRequestEvent('request-1')
    )

    const didRespond = respondToPermission({
      type: 'permission.response',
      kombuseSessionId: 'chat-session-alpha',
      requestId: 'request-1',
      behavior: 'allow',
    })
    expect(didRespond).toBe(true)

    expect(backendAlpha.respondToPermission).toHaveBeenCalledWith(
      'request-1',
      'allow',
      expect.objectContaining({ updatedInput: undefined, message: undefined })
    )
    expect(backendBeta.respondToPermission).not.toHaveBeenCalled()

    const pending = getPendingPermissions()
    expect(pending).toHaveLength(1)
    expect(pending[0]?.sessionId).toBe('chat-session-beta')
    expect(pending[0]?.permissionKey).toBe('chat-session-beta:request-1')

    expect(wsHub.broadcastToTopic).toHaveBeenCalledWith(
      '*',
      expect.objectContaining({
        type: 'agent.permission_resolved',
        sessionId: 'chat-session-alpha',
        requestId: 'request-1',
        permissionKey: 'chat-session-alpha:request-1',
      })
    )
  })
})

describe('AGENTS.md system prompt injection', () => {
  function createPassiveBackend(): AgentBackend {
    return {
      name: BACKEND_TYPES.CLAUDE_CODE,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      isRunning: vi.fn(() => true),
      getBackendSessionId: vi.fn(() => undefined),
    }
  }

  function createDeps(backend: AgentBackend) {
    return {
      getAgent: vi.fn(() => null),
      processEvent: vi.fn(() => []),
      createBackend: vi.fn(() => backend),
      generateSessionId: vi.fn(() => 'agents-md-test' as KombuseSessionId),
      resolveProjectPath: vi.fn(() => '/test/project'),
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
      stateMachine: {
        transition: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        setMetadata: vi.fn(),
      },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(ticketsRepository._getInternal).mockReturnValue(null)
    vi.mocked(sessionsRepository.list as ReturnType<typeof vi.fn>).mockReturnValue([])
  })

  it('prepends AGENTS.md content to system prompt when file exists', async () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).endsWith('AGENTS.md')
    )
    vi.mocked(readFileSync).mockImplementation(((p: string) => {
      if (String(p).endsWith('AGENTS.md')) {
        return '# Custom Agent Instructions\nDo not modify production data.'
      }
      throw new Error(`Unexpected readFileSync: ${p}`)
    }) as typeof readFileSync)

    const backend = createPassiveBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke',
        message: 'hello',
        kombuseSessionId: 'agents-md-test' as KombuseSessionId,
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    const startCall = (backend.start as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as StartOptions
    expect(startCall.systemPrompt).toContain('<project-instructions>')
    expect(startCall.systemPrompt).toContain('</project-instructions>')
    expect(startCall.systemPrompt).toContain('# Custom Agent Instructions')
    expect(startCall.systemPrompt).toContain('Do not modify production data.')
  })

  it('prepends AGENTS.md before agent-specific system prompt', async () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).endsWith('AGENTS.md')
    )
    vi.mocked(readFileSync).mockImplementation(((p: string) => {
      if (String(p).endsWith('AGENTS.md')) {
        return '# Project-wide rules'
      }
      throw new Error(`Unexpected readFileSync: ${p}`)
    }) as typeof readFileSync)

    const backend = createPassiveBackend()
    const deps = createDeps(backend)
    ;(deps.getAgent as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'test-agent-id',
      is_enabled: true,
      system_prompt: 'You are a helpful agent.',
      config: {},
      slug: 'test-agent',
      plugin_id: null,
      project_id: null,
    })

    startAgentChatSession(
      {
        type: 'agent.invoke',
        agentId: 'test-agent-id',
        message: 'hello',
        kombuseSessionId: 'agents-md-test' as KombuseSessionId,
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    const startCall = (backend.start as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as StartOptions
    const prompt = startCall.systemPrompt!
    const projectTagIndex = prompt.indexOf('<project-instructions>')
    const agentTagIndex = prompt.indexOf('<agent-instructions>')
    const agentPromptIndex = prompt.indexOf('You are a helpful agent.')
    expect(projectTagIndex).toBeGreaterThanOrEqual(0)
    expect(agentTagIndex).toBeGreaterThan(0)
    expect(agentPromptIndex).toBeGreaterThan(0)
    expect(projectTagIndex).toBeLessThan(agentTagIndex)
    expect(agentTagIndex).toBeLessThan(agentPromptIndex)
    expect(prompt).toContain('</project-instructions>')
    expect(prompt).toContain('</agent-instructions>')
  })

  it('does not inject anything when AGENTS.md does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false)

    const backend = createPassiveBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke',
        message: 'hello',
        kombuseSessionId: 'agents-md-test' as KombuseSessionId,
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    const startCall = (backend.start as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as StartOptions
    expect(startCall.systemPrompt ?? '').not.toContain('<project-instructions>')
  })

  it('does not inject anything when AGENTS.md is empty', async () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).endsWith('AGENTS.md')
    )
    vi.mocked(readFileSync).mockImplementation(((p: string) => {
      if (String(p).endsWith('AGENTS.md')) {
        return '   \n  \n  '
      }
      throw new Error(`Unexpected readFileSync: ${p}`)
    }) as typeof readFileSync)

    const backend = createPassiveBackend()
    const deps = createDeps(backend)

    startAgentChatSession(
      {
        type: 'agent.invoke',
        message: 'hello',
        kombuseSessionId: 'agents-md-test' as KombuseSessionId,
      },
      () => {},
      deps as any,
    )

    await waitForBackendStart(backend)

    const startCall = (backend.start as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as StartOptions
    expect(startCall.systemPrompt ?? '').not.toContain('<project-instructions>')
  })
})
