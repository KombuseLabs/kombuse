import { describe, it, expect, vi, beforeEach } from 'vitest'
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

describe('AppProvider active session ticketTitle handling', () => {
  beforeEach(() => {
    mockWebSocketHandler = undefined
    mockGetState.mockReset()
    mockGetState.mockResolvedValue({
      pendingPermissions: [],
      ticketAgentStatuses: [],
      activeSessions: [],
    })
  })

  it('stores ticketTitle from websocket agent.started messages', async () => {
    const { getCtx } = renderProvider()

    await waitFor(() => {
      expect(mockGetState).toHaveBeenCalled()
    })
    expect(mockWebSocketHandler).toBeDefined()

    act(() => {
      mockWebSocketHandler?.({
        type: 'agent.started',
        kombuseSessionId: 'chat-ticket-title',
        ticketId: 42,
        ticketTitle: 'Render title snippet beside ticket id',
        agentName: 'Coding Agent',
        startedAt: '2026-02-14T10:00:00.000Z',
      })
    })

    const session = getCtx().activeSessions.get('chat-ticket-title')
    expect(session).toBeDefined()
    expect(session?.ticketTitle).toBe('Render title snippet beside ticket id')
  })

  it('ingests ticketTitle from sync state active sessions', async () => {
    mockGetState.mockResolvedValue({
      pendingPermissions: [],
      ticketAgentStatuses: [],
      activeSessions: [{
        kombuseSessionId: 'sync-ticket-title',
        agentName: 'Planning Agent',
        ticketId: 288,
        ticketTitle: 'In active agent component next to ticket id show a bit of the title for better context',
        startedAt: '2026-02-14T10:05:00.000Z',
      }],
    })

    const { getCtx } = renderProvider()

    await waitFor(() => {
      const session = getCtx().activeSessions.get('sync-ticket-title')
      expect(session?.ticketTitle).toBe(
        'In active agent component next to ticket id show a bit of the title for better context'
      )
    })
  })
})
