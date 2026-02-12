import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useContext, type ReactNode } from 'react'
import type { PublicSession, KombuseSessionId, PendingPermission } from '@kombuse/types'
import { ChatProvider } from '../chat-provider'
import { ChatCtx, type ChatContextValue } from '../chat-context'

// --- Mocks ---

let mockSessionData: PublicSession | undefined
let mockPendingPermissions: Map<string, PendingPermission>

vi.mock('../../hooks/use-sessions', () => ({
  useSessionByKombuseId: () => ({ data: mockSessionData }),
  useSessionEvents: () => ({ data: undefined }),
}))

vi.mock('../../hooks/use-websocket', () => ({
  useWebSocket: () => ({ isConnected: false, send: vi.fn() }),
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
    activeSessions: new Map(),
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
    agent_id: null,
    status: 'completed',
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    failed_at: null,
    last_event_seq: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

/** Renders ChatProvider and captures the context value via a consumer child. */
function renderProvider(props: { sessionId?: string } = {}) {
  let ctx: ChatContextValue | null = null
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

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
    <ChatProvider sessionId={props.sessionId ?? 'sess-1'}>
      <Consumer />
    </ChatProvider>,
    { wrapper: Wrapper }
  )

  return { ...utils, getCtx: () => ctx! }
}

// --- Tests ---

describe('ChatProvider isLoading sync from session status', () => {
  beforeEach(() => {
    mockSessionData = undefined
    mockPendingPermissions = new Map()
  })

  it('should set isLoading to true when session status is running', () => {
    mockSessionData = makeSession({ status: 'running' })

    const { getCtx } = renderProvider()

    expect(getCtx().isLoading, 'isLoading should be true for running session').toBe(true)
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
    mockPendingPermissions = new Map()
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
