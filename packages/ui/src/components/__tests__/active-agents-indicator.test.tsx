import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useMemo, type ReactNode } from 'react'
import type { ActiveSessionInfo, AppContextValue } from '@kombuse/types'
import { ActiveAgentsIndicator } from '../active-agents-indicator'
import { AppCtx } from '@/providers/app-context'
import { WebSocketCtx, type WebSocketContextValue } from '@/providers/websocket-context'
import * as backendStatusHooks from '@/hooks/use-backend-status'
import * as profileSettingsHooks from '@/hooks/use-profile-settings'

const mockMutate = vi.fn()

vi.mock('@/hooks/use-backend-status', () => ({
  useBackendStatus: vi.fn(() => ({ data: undefined, isLoading: false })),
  useRefreshBackendStatus: vi.fn(() => ({ mutate: mockMutate, isPending: false })),
}))

vi.mock('@/hooks/use-profile-settings', () => ({
  useProfileSetting: vi.fn(() => ({ data: null })),
  useProfileSettings: vi.fn(() => ({ data: null })),
  useUpsertProfileSetting: vi.fn(() => ({ mutate: vi.fn() })),
}))

vi.mock('@/hooks/use-profile', () => ({
  useCurrentUserProfile: vi.fn(() => ({ data: { id: 'user-1' } })),
  useProfile: vi.fn(() => ({ data: { id: 'user-1' } })),
}))

const mockedUseProfileSetting = vi.mocked(profileSettingsHooks.useProfileSetting)

const mockedUseBackendStatus = vi.mocked(backendStatusHooks.useBackendStatus)

function TestProvider({
  children,
  sessions,
  currentProjectId = '1',
}: {
  children: ReactNode
  sessions: ActiveSessionInfo[]
  currentProjectId?: string | null
}) {
  const value = useMemo<AppContextValue>(() => ({
    currentTicket: null,
    currentProjectId,
    view: null,
    isGenerating: false,
    currentSession: null,
    pendingPermissions: new Map(),
    ticketAgentStatus: new Map(),
    activeSessions: new Map(sessions.map((session) => [session.kombuseSessionId, session])),
    defaultBackendType: 'claude-code',
    smartLabelIds: new Set(),
    setCurrentTicket: () => {},
    setCurrentProjectId: () => {},
    setView: () => {},
    setIsGenerating: () => {},
    setCurrentSession: () => {},
    addPendingPermission: () => {},
    removePendingPermission: () => {},
    clearPendingPermissionsForSession: () => {},
    updateTicketAgentStatus: () => {},
    getTicketAgentStatus: () => undefined,
    addActiveSession: () => {},
    removeActiveSession: () => {},
    setDefaultBackendType: () => {},
    setSmartLabelIds: () => {},
  }), [sessions, currentProjectId])

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

function renderIndicator(sessions: ActiveSessionInfo[], onNavigate?: (path: string) => void, currentProjectId: string | null = '1') {
  render(
    <TestProvider sessions={sessions} currentProjectId={currentProjectId}>
      <ActiveAgentsIndicator onNavigate={onNavigate} />
    </TestProvider>
  )

  fireEvent.click(screen.getByRole('button'))
}

beforeEach(() => {
  mockedUseBackendStatus.mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof backendStatusHooks.useBackendStatus>)
  mockMutate.mockClear()
})

describe('ActiveAgentsIndicator ticket context rendering', () => {
  it('renders ticket id and title snippet when both are available', () => {
    renderIndicator([
      {
        kombuseSessionId: 'session-1',
        agentName: 'Coding Agent',
        ticketNumber: 288,
        ticketTitle: 'Show title snippet in Active Agents indicator',
        effectiveBackend: 'claude-code',
        appliedModel: 'claude-sonnet-4-5',
        projectId: '1',
        startedAt: '2026-02-14T10:00:00.000Z',
      },
    ])

    expect(screen.getByText('#288')).toBeDefined()
    const title = screen.getByText('Show title snippet in Active Agents indicator')
    expect(title).toBeDefined()
    expect((title as HTMLElement).className).toContain('truncate')
    expect(screen.getByText('Backend: Claude Code')).toBeDefined()
    expect(screen.getByText('Model: claude-sonnet-4-5')).toBeDefined()
  })

  it('falls back to ticket id when title is unavailable', () => {
    renderIndicator([
      {
        kombuseSessionId: 'session-2',
        agentName: 'Coding Agent',
        ticketNumber: 289,
        effectiveBackend: 'codex',
        projectId: '1',
        startedAt: '2026-02-14T10:00:00.000Z',
      },
    ])

    expect(screen.getByText('#289')).toBeDefined()
    expect(screen.queryByText('Show title snippet in Active Agents indicator')).toBeNull()
    expect(screen.getByText('Backend: Codex')).toBeDefined()
    expect(screen.getByText('Model: Backend default')).toBeDefined()
  })

  it('falls back to Chat when ticket id is missing', () => {
    renderIndicator([
      {
        kombuseSessionId: 'session-3',
        agentName: 'Coding Agent',
        effectiveBackend: 'mock',
        appliedModel: 'mock-model',
        projectId: '1',
        startedAt: '2026-02-14T10:00:00.000Z',
      },
    ])

    expect(screen.getByText('Chat')).toBeDefined()
    expect(screen.getByText('Backend: Mock')).toBeDefined()
    expect(screen.getByText('Model: mock-model')).toBeDefined()
  })

  it('falls back to Unknown backend and Backend default model when metadata is missing', () => {
    renderIndicator([
      {
        kombuseSessionId: 'session-unknown',
        agentName: 'Coding Agent',
        projectId: '1',
        startedAt: '2026-02-14T10:00:00.000Z',
      },
    ])

    expect(screen.getByText('Backend: Unknown')).toBeDefined()
    expect(screen.getByText('Model: Backend default')).toBeDefined()
  })

  it('navigates to ticket with session query when both ids exist', () => {
    const onNavigate = vi.fn()

    renderIndicator([
      {
        kombuseSessionId: 'session-4',
        agentName: 'Coding Agent',
        ticketNumber: 290,
        projectId: '1',
        startedAt: '2026-02-14T10:00:00.000Z',
      },
    ], onNavigate)

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(onNavigate).toHaveBeenCalledWith('/projects/1/tickets/290?session=session-4')
  })

  it('navigates to chat route when ticket id is missing', () => {
    const onNavigate = vi.fn()

    renderIndicator([
      {
        kombuseSessionId: 'session-5',
        agentName: 'Coding Agent',
        projectId: '1',
        startedAt: '2026-02-14T10:00:00.000Z',
      },
    ], onNavigate)

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(onNavigate).toHaveBeenCalledWith('/projects/1/chats/session-5')
  })
})

describe('ActiveAgentsIndicator backend status section', () => {
  it('renders backend status with correct dots and labels', () => {
    mockedUseBackendStatus.mockReturnValue({
      data: [
        { backendType: 'claude-code', available: true, version: '1.0.59', path: '/usr/bin/claude' },
        { backendType: 'codex', available: false, version: null, path: null },
      ],
      isLoading: false,
    } as ReturnType<typeof backendStatusHooks.useBackendStatus>)

    renderIndicator([])

    expect(screen.getByText('Backend Status')).toBeDefined()
    expect(screen.getByText('Claude Code')).toBeDefined()
    expect(screen.getByText('1.0.59')).toBeDefined()
    expect(screen.getByText('Codex')).toBeDefined()
    expect(screen.getByText('Check again')).toBeDefined()
  })

  it('shows version string when available', () => {
    mockedUseBackendStatus.mockReturnValue({
      data: [
        { backendType: 'claude-code', available: true, version: '1.0.59', path: '/usr/bin/claude' },
      ],
      isLoading: false,
    } as ReturnType<typeof backendStatusHooks.useBackendStatus>)

    renderIndicator([])

    expect(screen.getByText('1.0.59')).toBeDefined()
  })

  it('shows Check again button only when a backend is unavailable', () => {
    mockedUseBackendStatus.mockReturnValue({
      data: [
        { backendType: 'claude-code', available: true, version: '1.0.59', path: '/usr/bin/claude' },
      ],
      isLoading: false,
    } as ReturnType<typeof backendStatusHooks.useBackendStatus>)

    renderIndicator([])

    expect(screen.queryByText('Check again')).toBeNull()
  })

  it('shows Check again button when a backend is unavailable', () => {
    mockedUseBackendStatus.mockReturnValue({
      data: [
        { backendType: 'claude-code', available: true, version: '1.0.59', path: '/usr/bin/claude' },
        { backendType: 'codex', available: false, version: null, path: null },
      ],
      isLoading: false,
    } as ReturnType<typeof backendStatusHooks.useBackendStatus>)

    renderIndicator([])

    expect(screen.getByText('Check again')).toBeDefined()
  })

  it('calls refresh mutation when Check again is clicked', () => {
    mockedUseBackendStatus.mockReturnValue({
      data: [
        { backendType: 'codex', available: false, version: null, path: null },
      ],
      isLoading: false,
    } as ReturnType<typeof backendStatusHooks.useBackendStatus>)

    renderIndicator([])

    fireEvent.click(screen.getByText('Check again'))
    expect(mockMutate).toHaveBeenCalledOnce()
  })

  it('does not render backend status section when data is undefined', () => {
    mockedUseBackendStatus.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof backendStatusHooks.useBackendStatus>)

    renderIndicator([])

    expect(screen.queryByText('Backend Status')).toBeNull()
  })
})

describe('ActiveAgentsIndicator project scoping', () => {
  beforeEach(() => {
    mockedUseBackendStatus.mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof backendStatusHooks.useBackendStatus>)
    mockMutate.mockClear()
    mockedUseProfileSetting.mockReturnValue({ data: null } as any)
  })

  it('filters sessions by project when scope is project (default)', () => {
    renderIndicator([
      {
        kombuseSessionId: 'session-proj1',
        agentName: 'Agent A',
        projectId: '1',
        effectiveBackend: 'claude-code',
        startedAt: '2026-02-14T10:00:00.000Z',
      },
      {
        kombuseSessionId: 'session-proj2',
        agentName: 'Agent B',
        projectId: '2',
        effectiveBackend: 'claude-code',
        startedAt: '2026-02-14T10:00:00.000Z',
      },
    ])

    expect(screen.getByText('Agent A')).toBeDefined()
    expect(screen.queryByText('Agent B')).toBeNull()
  })

  it('shows all sessions when scope is all', () => {
    mockedUseProfileSetting.mockReturnValue({
      data: { setting_value: 'all' },
    } as any)

    renderIndicator([
      {
        kombuseSessionId: 'session-proj1',
        agentName: 'Agent A',
        projectId: '1',
        effectiveBackend: 'claude-code',
        startedAt: '2026-02-14T10:00:00.000Z',
      },
      {
        kombuseSessionId: 'session-proj2',
        agentName: 'Agent B',
        projectId: '2',
        effectiveBackend: 'claude-code',
        startedAt: '2026-02-14T10:00:00.000Z',
      },
    ])

    expect(screen.getByText('Agent A')).toBeDefined()
    expect(screen.getByText('Agent B')).toBeDefined()
  })

  it('hides sessions without projectId when scope is project', () => {
    renderIndicator([
      {
        kombuseSessionId: 'session-no-project',
        agentName: 'Agent C',
        effectiveBackend: 'claude-code',
        startedAt: '2026-02-14T10:00:00.000Z',
      },
    ])

    expect(screen.queryByText('Agent C')).toBeNull()
  })

  it('shows empty state when currentProjectId is null and scope is project', () => {
    renderIndicator([
      {
        kombuseSessionId: 'session-proj1',
        agentName: 'Agent D',
        projectId: '1',
        effectiveBackend: 'claude-code',
        startedAt: '2026-02-14T10:00:00.000Z',
      },
    ], undefined, null)

    expect(screen.queryByText('Agent D')).toBeNull()
  })
})

describe('ActiveAgentsIndicator disconnection indicator', () => {
  function renderWithWs(
    sessions: ActiveSessionInfo[],
    wsOverrides: Partial<WebSocketContextValue> = {},
  ) {
    const wsValue: WebSocketContextValue = {
      isConnected: true,
      send: vi.fn(),
      registerTopics: vi.fn(),
      unregisterTopics: vi.fn(),
      addMessageHandler: vi.fn(),
      removeMessageHandler: vi.fn(),
      ...wsOverrides,
    }

    render(
      <WebSocketCtx.Provider value={wsValue}>
        <TestProvider sessions={sessions}>
          <ActiveAgentsIndicator />
        </TestProvider>
      </WebSocketCtx.Provider>
    )

    fireEvent.click(screen.getByRole('button'))
  }

  it('shows disconnection banner when WebSocket is disconnected', () => {
    renderWithWs([], { isConnected: false })
    expect(screen.getByText(/Live updates paused/)).toBeDefined()
  })

  it('does not show disconnection banner when connected', () => {
    renderWithWs([], { isConnected: true })
    expect(screen.queryByText(/Live updates paused/)).toBeNull()
  })

  it('shows amber dot on button when disconnected', () => {
    renderWithWs([], { isConnected: false })
    const button = screen.getByRole('button')
    const amberDot = button.querySelector('.bg-amber-500')
    expect(amberDot).not.toBeNull()
  })

  it('does not show amber dot on button when connected', () => {
    renderWithWs([], { isConnected: true })
    const button = screen.getByRole('button')
    const amberDot = button.querySelector('.bg-amber-500')
    expect(amberDot).toBeNull()
  })
})
