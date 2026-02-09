import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useContext, type ReactNode } from 'react'
import type { Session, KombuseSessionId } from '@kombuse/types'
import { ChatProvider } from '../chat-provider'
import { ChatCtx, type ChatContextValue } from '../chat-context'

// --- Mocks ---

let mockSessionData: Session | undefined

vi.mock('../../hooks/use-sessions', () => ({
  useSession: () => ({ data: mockSessionData }),
  useSessionEvents: () => ({ data: undefined }),
}))

vi.mock('../../hooks/use-websocket', () => ({
  useWebSocket: () => ({ isConnected: false, send: vi.fn() }),
}))

// --- Helpers ---

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    kombuse_session_id: 'ks-abc-123' as KombuseSessionId,
    backend_type: 'mock',
    backend_session_id: null,
    ticket_id: null,
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
