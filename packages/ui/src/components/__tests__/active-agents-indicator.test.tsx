import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useMemo, type ReactNode } from 'react'
import type { ActiveSessionInfo, AppContextValue } from '@kombuse/types'
import { ActiveAgentsIndicator } from '../active-agents-indicator'
import { AppCtx } from '../../providers/app-context'

function TestProvider({
  children,
  sessions,
}: {
  children: ReactNode
  sessions: ActiveSessionInfo[]
}) {
  const value = useMemo<AppContextValue>(() => ({
    currentTicket: null,
    currentProjectId: '1',
    view: null,
    isGenerating: false,
    currentSession: null,
    pendingPermissions: new Map(),
    ticketAgentStatus: new Map(),
    activeSessions: new Map(sessions.map((session) => [session.kombuseSessionId, session])),
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
  }), [sessions])

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

function renderIndicator(sessions: ActiveSessionInfo[], onNavigate?: (path: string) => void) {
  render(
    <TestProvider sessions={sessions}>
      <ActiveAgentsIndicator onNavigate={onNavigate} />
    </TestProvider>
  )

  fireEvent.click(screen.getByRole('button'))
}

describe('ActiveAgentsIndicator ticket context rendering', () => {
  it('renders ticket id and title snippet when both are available', () => {
    renderIndicator([
      {
        kombuseSessionId: 'session-1',
        agentName: 'Coding Agent',
        ticketId: 288,
        ticketTitle: 'Show title snippet in Active Agents indicator',
        effectiveBackend: 'claude-code',
        appliedModel: 'claude-sonnet-4-5',
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
        ticketId: 289,
        effectiveBackend: 'codex',
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
        ticketId: 290,
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
        startedAt: '2026-02-14T10:00:00.000Z',
      },
    ], onNavigate)

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(onNavigate).toHaveBeenCalledWith('/projects/1/chats/session-5')
  })
})
