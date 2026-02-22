import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useContext } from 'react'
import type { AppContextValue, ServerMessage } from '@kombuse/types'
import { AppProvider } from '../app-provider'
import { AppCtx } from '../app-context'

let mockWebSocketHandler: ((message: ServerMessage) => void) | undefined
const mockGetState = vi.fn()

vi.mock('../../hooks/use-websocket', () => ({
  useWebSocket: ({ onMessage }: { onMessage: (message: ServerMessage) => void }) => {
    mockWebSocketHandler = onMessage
    return {
      isConnected: true,
      send: vi.fn(),
    }
  },
}))

vi.mock('../../lib/api', () => ({
  syncApi: {
    getState: () => mockGetState(),
  },
}))

function renderProvider() {
  let ctx: AppContextValue | null = null

  function Consumer() {
    ctx = useContext(AppCtx)
    return null
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <Consumer />
      </AppProvider>
    </QueryClientProvider>
  )

  return {
    getCtx: () => {
      if (!ctx) {
        throw new Error('App context is not available')
      }
      return ctx
    },
  }
}

describe('AppProvider permission key collision handling', () => {
  beforeEach(() => {
    mockWebSocketHandler = undefined
    mockGetState.mockReset()
    mockGetState.mockResolvedValue({
      pendingPermissions: [],
      ticketAgentStatuses: [],
      activeSessions: [],
    })
  })

  it('keeps same-requestId permissions from different sessions and resolves only the targeted key', async () => {
    const { getCtx } = renderProvider()

    await waitFor(() => {
      expect(mockGetState).toHaveBeenCalled()
    })
    expect(mockWebSocketHandler).toBeDefined()

    act(() => {
      mockWebSocketHandler?.({
        type: 'agent.permission_pending',
        permissionKey: 'chat-alpha:req-1',
        sessionId: 'chat-alpha',
        requestId: 'req-1',
        toolName: 'Bash',
        input: { command: 'ls' },
        description: 'List files',
      })
      mockWebSocketHandler?.({
        type: 'agent.permission_pending',
        permissionKey: 'chat-beta:req-1',
        sessionId: 'chat-beta',
        requestId: 'req-1',
        toolName: 'Bash',
        input: { command: 'pwd' },
        description: 'Print current directory',
      })
    })

    expect(getCtx().pendingPermissions.size).toBe(2)
    expect(getCtx().pendingPermissions.has('chat-alpha:req-1')).toBe(true)
    expect(getCtx().pendingPermissions.has('chat-beta:req-1')).toBe(true)

    act(() => {
      mockWebSocketHandler?.({
        type: 'agent.permission_resolved',
        permissionKey: 'chat-alpha:req-1',
        sessionId: 'chat-alpha',
        requestId: 'req-1',
      })
    })

    expect(getCtx().pendingPermissions.size).toBe(1)
    expect(getCtx().pendingPermissions.has('chat-alpha:req-1')).toBe(false)
    expect(getCtx().pendingPermissions.has('chat-beta:req-1')).toBe(true)
  })
})

describe('AppProvider active session metadata handling', () => {
  beforeEach(() => {
    mockWebSocketHandler = undefined
    mockGetState.mockReset()
    mockGetState.mockResolvedValue({
      pendingPermissions: [],
      ticketAgentStatuses: [],
      activeSessions: [],
    })
  })

  it('stores ticketTitle/backend/model from websocket agent.started messages', async () => {
    const { getCtx } = renderProvider()

    await waitFor(() => {
      expect(mockGetState).toHaveBeenCalled()
    })
    expect(mockWebSocketHandler).toBeDefined()

    act(() => {
      mockWebSocketHandler?.({
        type: 'agent.started',
        kombuseSessionId: 'chat-ticket-title',
        ticketNumber: 42,
        ticketTitle: 'Render title snippet beside ticket id',
        agentName: 'Coding Agent',
        effectiveBackend: 'codex',
        appliedModel: 'gpt-5-mini',
        startedAt: '2026-02-14T10:00:00.000Z',
      })
    })

    const session = getCtx().activeSessions.get('chat-ticket-title')
    expect(session).toBeDefined()
    expect(session?.ticketTitle).toBe('Render title snippet beside ticket id')
    expect(session?.effectiveBackend).toBe('codex')
    expect(session?.appliedModel).toBe('gpt-5-mini')
  })

  it('ingests ticketTitle/backend/model from sync state active sessions', async () => {
    mockGetState.mockResolvedValue({
      pendingPermissions: [],
      ticketAgentStatuses: [],
      activeSessions: [{
        kombuseSessionId: 'sync-ticket-title',
        agentName: 'Planning Agent',
        ticketNumber: 288,
        ticketTitle: 'In active agent component next to ticket id show a bit of the title for better context',
        effectiveBackend: 'claude-code',
        startedAt: '2026-02-14T10:05:00.000Z',
      }],
    })

    const { getCtx } = renderProvider()

    await waitFor(() => {
      const session = getCtx().activeSessions.get('sync-ticket-title')
      expect(session?.ticketTitle).toBe(
        'In active agent component next to ticket id show a bit of the title for better context'
      )
      expect(session?.effectiveBackend).toBe('claude-code')
      expect(session?.appliedModel).toBeUndefined()
    })
  })

  it('upserts backend/model metadata for existing sessions without resetting startedAt', async () => {
    const { getCtx } = renderProvider()

    await waitFor(() => {
      expect(mockGetState).toHaveBeenCalled()
    })
    expect(mockWebSocketHandler).toBeDefined()

    act(() => {
      mockWebSocketHandler?.({
        type: 'agent.started',
        kombuseSessionId: 'chat-upsert',
        ticketNumber: 42,
        ticketTitle: 'Initial title',
        agentName: 'Coding Agent',
        effectiveBackend: 'codex',
        appliedModel: 'gpt-5-mini',
        startedAt: '2026-02-14T10:00:00.000Z',
      })
    })

    act(() => {
      mockWebSocketHandler?.({
        type: 'agent.started',
        kombuseSessionId: 'chat-upsert',
        ticketNumber: 42,
        ticketTitle: 'Updated title',
        agentName: 'Coding Agent',
        effectiveBackend: 'claude-code',
        startedAt: '2026-02-14T10:05:00.000Z',
      })
    })

    const session = getCtx().activeSessions.get('chat-upsert')
    expect(session).toBeDefined()
    expect(session?.ticketTitle).toBe('Updated title')
    expect(session?.effectiveBackend).toBe('claude-code')
    expect(session?.appliedModel).toBeUndefined()
    expect(session?.startedAt).toBe('2026-02-14T10:00:00.000Z')
  })
})

describe('AppProvider ticketAgentStatus pruning', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockWebSocketHandler = undefined
    mockGetState.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('prunes stale ticketAgentStatus entries after periodic sync', async () => {
    // Mount sync returns ticket 42 with error status
    let callCount = 0
    mockGetState.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          pendingPermissions: [],
          ticketAgentStatuses: [
            { ticketNumber: 42, projectId: '1', status: 'error', sessionCount: 0 },
          ],
          activeSessions: [],
        })
      }
      // Periodic sync: ticket 42 no longer present
      return Promise.resolve({
        pendingPermissions: [],
        ticketAgentStatuses: [],
        activeSessions: [],
      })
    })

    const { getCtx } = renderProvider()

    // Flush the mount sync promise and resulting state updates
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(getCtx().ticketAgentStatus.get(42)?.status).toBe('error')

    // Advance past the 30s periodic sync interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(getCtx().ticketAgentStatus.has(42)).toBe(false)
  })

  it('does not store idle entries from server sync response', async () => {
    mockGetState.mockResolvedValue({
      pendingPermissions: [],
      ticketAgentStatuses: [
        { ticketNumber: 42, projectId: '1', status: 'error', sessionCount: 0 },
        { ticketNumber: 99, projectId: '1', status: 'idle', sessionCount: 0 },
      ],
      activeSessions: [],
    })

    const { getCtx } = renderProvider()

    // Flush the mount sync promise and resulting state updates
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(getCtx().ticketAgentStatus.get(42)?.status).toBe('error')
    expect(getCtx().ticketAgentStatus.has(99)).toBe(false)
  })

  it('removes ticketAgentStatus entry when WebSocket sends idle status', async () => {
    mockGetState.mockResolvedValue({
      pendingPermissions: [],
      ticketAgentStatuses: [
        { ticketNumber: 42, projectId: '1', status: 'running', sessionCount: 1 },
      ],
      activeSessions: [],
    })

    const { getCtx } = renderProvider()

    // Flush the mount sync promise and resulting state updates
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(getCtx().ticketAgentStatus.get(42)?.status).toBe('running')

    act(() => {
      mockWebSocketHandler?.({
        type: 'ticket.agent_status',
        ticketNumber: 42,
        projectId: '1',
        status: 'idle',
        sessionCount: 0,
      })
    })

    expect(getCtx().ticketAgentStatus.has(42)).toBe(false)
  })
})
