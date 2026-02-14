import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useContext, type ReactNode } from 'react'
import type {
  PublicSession,
  KombuseSessionId,
  PendingPermission,
  SessionEvent,
  ActiveSessionInfo,
  ServerMessage,
  SerializedAgentEvent,
} from '@kombuse/types'
import { ChatProvider } from '../chat-provider'
import { ChatCtx, type ChatContextValue } from '../chat-context'

// --- Mocks ---

let mockSessionData: PublicSession | undefined
let mockSessionEventsData:
  | { session_id: string; events: SessionEvent[]; total: number }
  | undefined
let mockPendingPermissions: Map<string, PendingPermission>
let mockActiveSessions: Map<string, ActiveSessionInfo>
const mockUseSessionByKombuseId = vi.fn((_kombuseSessionId: string | null) => ({ data: mockSessionData }))
const mockUseSessionEvents = vi.fn((
  _kombuseSessionId: string | null,
  _filters?: { since_seq?: number; event_type?: string; limit?: number }
) => ({ data: mockSessionEventsData }))
const mockWebSocketSend = vi.fn()
let mockWebSocketOnMessage: ((message: ServerMessage) => void) | undefined

vi.mock('../../hooks/use-sessions', () => ({
  useSessionByKombuseId: (kombuseSessionId: string | null) =>
    mockUseSessionByKombuseId(kombuseSessionId),
  useSessionEvents: (
    kombuseSessionId: string | null,
    filters?: { since_seq?: number; event_type?: string; limit?: number }
  ) => mockUseSessionEvents(kombuseSessionId, filters),
}))

vi.mock('../../hooks/use-websocket', () => ({
  useWebSocket: ({ onMessage }: { onMessage: (message: ServerMessage) => void }) => {
    mockWebSocketOnMessage = onMessage
    return { isConnected: false, send: mockWebSocketSend }
  },
}))

vi.mock('../../hooks/use-app-context', () => ({
  useAppContext: () => ({
    pendingPermissions: mockPendingPermissions,
    currentProjectId: null,
    currentTicket: null,
    view: null,
    isGenerating: false,
    currentSession: null,
    ticketAgentStatus: new Map(),
    activeSessions: mockActiveSessions,
    setCurrentTicket: vi.fn(),
    setCurrentProjectId: vi.fn(),
    setView: vi.fn(),
    setIsGenerating: vi.fn(),
    setCurrentSession: vi.fn(),
    addPendingPermission: vi.fn(),
    removePendingPermission: vi.fn(),
    clearPendingPermissionsForSession: vi.fn(),
    updateTicketAgentStatus: vi.fn(),
    getTicketAgentStatus: vi.fn(),
    addActiveSession: vi.fn(),
    removeActiveSession: vi.fn(),
  }),
}))

// --- Helpers ---

function makeSession(overrides: Partial<PublicSession> = {}): PublicSession {
  return {
    kombuse_session_id: 'chat-00000000-0000-0000-0000-000000000001' as KombuseSessionId,
    backend_type: 'mock',
    backend_session_id: null,
    ticket_id: null,
    project_id: null,
    agent_id: null,
    status: 'completed',
    metadata: {},
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    failed_at: null,
    aborted_at: null,
    last_event_seq: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeSessionEvent(seq: number): SessionEvent {
  const payload = makeSerializedEvent(seq)
  return {
    id: seq,
    session_id: 'session-1',
    seq,
    event_type: 'message',
    payload: payload as unknown as Record<string, unknown>,
    created_at: new Date().toISOString(),
  }
}

function makeSerializedEvent(seq: number): Extract<SerializedAgentEvent, { type: 'message' }> {
  return {
    type: 'message',
    eventId: `event-${seq}`,
    role: 'assistant',
    content: `message-${seq}`,
    backend: 'mock',
    timestamp: seq,
  }
}

/** Renders ChatProvider and captures the context value via a consumer child. */
function renderProvider(props: { sessionId?: string | null; agentId?: string } = {}) {
  let ctx: ChatContextValue | null = null
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const resolvedSessionId = Object.prototype.hasOwnProperty.call(props, 'sessionId')
    ? props.sessionId
    : 'sess-1'

  function Consumer() {
    ctx = useContext(ChatCtx)
    return null
  }

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }

  const utils = render(
    <ChatProvider sessionId={resolvedSessionId} agentId={props.agentId}>
      <Consumer />
    </ChatProvider>,
    { wrapper: Wrapper }
  )

  function rerenderProvider(nextProps: { sessionId?: string | null; agentId?: string } = {}) {
    const nextResolvedSessionId = Object.prototype.hasOwnProperty.call(nextProps, 'sessionId')
      ? nextProps.sessionId
      : 'sess-1'

    utils.rerender(
      <ChatProvider sessionId={nextResolvedSessionId} agentId={nextProps.agentId}>
        <Consumer />
      </ChatProvider>
    )
  }

  return { ...utils, getCtx: () => ctx!, rerenderProvider }
}

// --- Tests ---

describe('ChatProvider isLoading sync from session status', () => {
  beforeEach(() => {
    mockSessionData = undefined
    mockSessionEventsData = undefined
    mockPendingPermissions = new Map()
    mockActiveSessions = new Map()
    mockWebSocketOnMessage = undefined
    mockWebSocketSend.mockReset()
    mockUseSessionByKombuseId.mockClear()
    mockUseSessionEvents.mockClear()
  })

  it('should set isLoading to true when running session is active', () => {
    const sessionId = 'chat-00000000-0000-0000-0000-000000000001' as KombuseSessionId
    const session = makeSession({ status: 'running', kombuse_session_id: sessionId })
    mockSessionData = session
    mockActiveSessions = new Map([
      [sessionId, {
        kombuseSessionId: sessionId,
        agentName: 'Test Agent',
        startedAt: new Date().toISOString(),
      }],
    ])

    const { getCtx } = renderProvider()

    expect(getCtx().isLoading, 'isLoading should be true for active running session').toBe(true)
  })

  it('should set isLoading to false when running session is not active', () => {
    mockSessionData = makeSession({ status: 'running' })

    const { getCtx } = renderProvider()

    expect(getCtx().isLoading, 'isLoading should be false for inactive running session').toBe(false)
  })

  it('should set isLoading to false when session status is completed', () => {
    mockSessionData = makeSession({ status: 'completed' })

    const { getCtx } = renderProvider()

    expect(getCtx().isLoading, 'isLoading should be false for completed session').toBe(false)
  })

  it('should set isLoading to false when session status is failed', () => {
    mockSessionData = makeSession({ status: 'failed' })

    const { getCtx } = renderProvider()

    expect(getCtx().isLoading, 'isLoading should be false for failed session').toBe(false)
  })

  it('should set isLoading to false when session status is aborted', () => {
    mockSessionData = makeSession({ status: 'aborted' })

    const { getCtx } = renderProvider()

    expect(getCtx().isLoading, 'isLoading should be false for aborted session').toBe(false)
  })
})

describe('ChatProvider pendingPermission restoration from AppProvider', () => {
  beforeEach(() => {
    mockSessionData = undefined
    mockSessionEventsData = undefined
    mockPendingPermissions = new Map()
    mockActiveSessions = new Map()
    mockWebSocketOnMessage = undefined
    mockWebSocketSend.mockReset()
    mockUseSessionByKombuseId.mockClear()
    mockUseSessionEvents.mockClear()
  })

  it('should restore pendingPermission when AppProvider has a matching global permission', () => {
    const sessionId = 'chat-00000000-0000-0000-0000-000000000001' as KombuseSessionId
    mockSessionData = makeSession({ kombuse_session_id: sessionId, status: 'running' })
    mockPendingPermissions = new Map([
      ['req-1', {
        sessionId,
        requestId: 'req-1',
        toolName: 'AskUserQuestion',
        input: { questions: [{ question: 'Pick one', header: 'Choice', options: [{ label: 'A' }] }] },
        description: 'Ask the user a question',
      }],
    ])

    const { getCtx } = renderProvider()

    const perm = getCtx().pendingPermission
    expect(perm, 'pendingPermission should be restored from global map').not.toBeNull()
    expect(perm!.requestId).toBe('req-1')
    expect(perm!.toolName).toBe('AskUserQuestion')
    expect(perm!.type).toBe('permission_request')
  })

  it('should not restore pendingPermission when no global permission matches session', () => {
    mockSessionData = makeSession({ status: 'running' })
    mockPendingPermissions = new Map([
      ['req-2', {
        sessionId: 'other-session-id',
        requestId: 'req-2',
        toolName: 'AskUserQuestion',
        input: { questions: [] },
      }],
    ])

    const { getCtx } = renderProvider()

    expect(getCtx().pendingPermission, 'pendingPermission should be null for non-matching session').toBeNull()
  })

  it('should restore ExitPlanMode permission from AppProvider', () => {
    const sessionId = 'chat-00000000-0000-0000-0000-000000000001' as KombuseSessionId
    mockSessionData = makeSession({ kombuse_session_id: sessionId, status: 'running' })
    mockPendingPermissions = new Map([
      ['req-3', {
        sessionId,
        requestId: 'req-3',
        toolName: 'ExitPlanMode',
        input: { allowedPrompts: [{ tool: 'Bash', prompt: 'run tests' }] },
        description: 'Plan review: 1 tool permission requested',
      }],
    ])

    const { getCtx } = renderProvider()

    const perm = getCtx().pendingPermission
    expect(perm, 'ExitPlanMode permission should be restored').not.toBeNull()
    expect(perm!.toolName).toBe('ExitPlanMode')
    expect(perm!.requestId).toBe('req-3')
  })
})

describe('ChatProvider historical event loading', () => {
  beforeEach(() => {
    mockSessionData = undefined
    mockSessionEventsData = undefined
    mockPendingPermissions = new Map()
    mockActiveSessions = new Map()
    mockWebSocketOnMessage = undefined
    mockWebSocketSend.mockReset()
    mockUseSessionByKombuseId.mockClear()
    mockUseSessionEvents.mockClear()
  })

  it('requests initial history with a 1000-event limit', () => {
    mockSessionData = makeSession({
      kombuse_session_id: 'chat-00000000-0000-0000-0000-000000000001' as KombuseSessionId,
    })

    renderProvider({ sessionId: 'sess-1' })

    expect(mockUseSessionEvents).toHaveBeenCalledWith(
      'chat-00000000-0000-0000-0000-000000000001',
      { limit: 1000 }
    )
  })

  it('merges history refetches without dropping newer local events and dedupes by eventId', async () => {
    mockSessionData = makeSession({
      kombuse_session_id: 'chat-00000000-0000-0000-0000-000000000001' as KombuseSessionId,
    })
    mockSessionEventsData = {
      session_id: 'chat-00000000-0000-0000-0000-000000000001',
      events: [makeSessionEvent(1), makeSessionEvent(2), makeSessionEvent(3)],
      total: 3,
    }

    const { getCtx, rerenderProvider } = renderProvider({ sessionId: 'sess-1' })

    await waitFor(() => {
      expect(getCtx().events.map((event) => event.eventId)).toEqual([
        'event-1',
        'event-2',
        'event-3',
      ])
      expect(getCtx().historyLoadedCount).toBe(3)
      expect(getCtx().historyTotalCount).toBe(3)
    })

    mockSessionEventsData = {
      session_id: 'chat-00000000-0000-0000-0000-000000000001',
      events: [makeSessionEvent(1), makeSessionEvent(2)],
      total: 3,
    }
    rerenderProvider({ sessionId: 'sess-1' })

    await waitFor(() => {
      expect(getCtx().events.map((event) => event.eventId)).toEqual([
        'event-1',
        'event-2',
        'event-3',
      ])
    })

    mockSessionEventsData = {
      session_id: 'chat-00000000-0000-0000-0000-000000000001',
      events: [makeSessionEvent(2), makeSessionEvent(3), makeSessionEvent(4)],
      total: 4,
    }
    rerenderProvider({ sessionId: 'sess-1' })

    await waitFor(() => {
      const eventIds = getCtx().events.map((event) => event.eventId)
      expect(eventIds).toEqual(['event-1', 'event-2', 'event-3', 'event-4'])
      expect(new Set(eventIds).size).toBe(eventIds.length)
    })
  })

  it('keeps chronological order when live events arrive before history fetch resolves', async () => {
    mockSessionData = makeSession({
      kombuse_session_id: 'chat-00000000-0000-0000-0000-000000000001' as KombuseSessionId,
      status: 'running',
    })
    mockSessionEventsData = undefined

    const { getCtx, rerenderProvider } = renderProvider({ sessionId: 'sess-1' })

    expect(mockWebSocketOnMessage).toBeDefined()

    act(() => {
      mockWebSocketOnMessage?.({
        type: 'agent.event',
        kombuseSessionId: 'chat-00000000-0000-0000-0000-000000000001',
        event: makeSerializedEvent(151),
      })
      mockWebSocketOnMessage?.({
        type: 'agent.event',
        kombuseSessionId: 'chat-00000000-0000-0000-0000-000000000001',
        event: makeSerializedEvent(152),
      })
    })

    await waitFor(() => {
      expect(getCtx().events.map((event) => event.eventId)).toEqual(['event-151', 'event-152'])
    })

    mockSessionEventsData = {
      session_id: 'chat-00000000-0000-0000-0000-000000000001',
      events: Array.from({ length: 100 }, (_, index) => makeSessionEvent(index + 51)),
      total: 152,
    }
    rerenderProvider({ sessionId: 'sess-1' })

    await waitFor(() => {
      const eventIds = getCtx().events.map((event) => event.eventId)
      expect(eventIds).toEqual(
        Array.from({ length: 102 }, (_, index) => `event-${index + 51}`)
      )
      expect(new Set(eventIds).size).toBe(eventIds.length)
    })
  })

  it('resets event state when switching sessions and when switching from session mode to live mode', async () => {
    mockSessionData = makeSession({
      kombuse_session_id: 'chat-00000000-0000-0000-0000-000000000001' as KombuseSessionId,
    })
    mockSessionEventsData = {
      session_id: 'chat-00000000-0000-0000-0000-000000000001',
      events: [makeSessionEvent(1), makeSessionEvent(2)],
      total: 2,
    }

    const { getCtx, rerenderProvider } = renderProvider({ sessionId: 'sess-1' })

    await waitFor(() => {
      expect(getCtx().events.map((event) => event.eventId)).toEqual(['event-1', 'event-2'])
    })

    mockSessionData = makeSession({
      kombuse_session_id: 'chat-00000000-0000-0000-0000-000000000002' as KombuseSessionId,
    })
    mockSessionEventsData = {
      session_id: 'chat-00000000-0000-0000-0000-000000000002',
      events: [makeSessionEvent(10)],
      total: 1,
    }
    rerenderProvider({ sessionId: 'sess-2' })

    await waitFor(() => {
      expect(getCtx().events.map((event) => event.eventId)).toEqual(['event-10'])
    })

    mockSessionData = undefined
    mockSessionEventsData = undefined
    rerenderProvider({ sessionId: undefined, agentId: 'agent-1' })

    await waitFor(() => {
      expect(getCtx().events).toEqual([])
      expect(getCtx().historyLoadedCount).toBeNull()
      expect(getCtx().historyTotalCount).toBeNull()
    })
  })
})
