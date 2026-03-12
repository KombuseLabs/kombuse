import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useMemo, useState, type ReactNode } from 'react'
import type { AppContextValue, PendingPermission } from '@kombuse/types'
import { NotificationBell } from '../notification-bell'
import { useAppContext } from '@/hooks/use-app-context'
import { AppCtx } from '@/providers/app-context'
import * as profileSettingsHooks from '@/hooks/use-profile-settings'

const mockSend = vi.fn()

vi.mock('@/hooks/use-websocket', () => ({
  useWebSocket: () => ({
    isConnected: true,
    send: mockSend,
  }),
}))

vi.mock('@/hooks/use-profile-settings', () => ({
  useProfileSetting: vi.fn(() => ({ data: null })),
  useProfileSettings: vi.fn(() => ({ data: null })),
  useUpsertProfileSetting: vi.fn(() => ({ mutate: vi.fn() })),
}))

const mockedUseProfileSetting = vi.mocked(profileSettingsHooks.useProfileSetting)

function createPermission(permission: PendingPermission): PendingPermission {
  return permission
}

function TestProvider({
  children,
  initialPermissions,
  currentProjectId = '1',
}: {
  children: ReactNode
  initialPermissions?: PendingPermission[]
  currentProjectId?: string | null
}) {
  const [pendingPermissions, setPendingPermissions] = useState(
    new Map<string, PendingPermission>(
      (initialPermissions ?? [
        createPermission({
          permissionKey: 'chat-alpha:req-1',
          sessionId: 'chat-alpha',
          requestId: 'req-1',
          toolName: 'Bash',
          input: { command: 'ls' },
          description: 'Permission A',
          projectId: '1',
        }),
        createPermission({
          permissionKey: 'chat-beta:req-1',
          sessionId: 'chat-beta',
          requestId: 'req-1',
          toolName: 'Bash',
          input: { command: 'pwd' },
          description: 'Permission B',
          projectId: '1',
        }),
      ]).map((permission) => [permission.permissionKey, permission])
    )
  )

  const value = useMemo<AppContextValue>(() => ({
    currentTicket: null,
    currentProjectId,
    view: null,
    isGenerating: false,
    currentSession: null,
    pendingPermissions,
    ticketAgentStatus: new Map(),
    activeSessions: new Map(),
    defaultBackendType: 'claude-code',
    smartLabelIds: new Set(),
    setCurrentTicket: () => {},
    setCurrentProjectId: () => {},
    setView: () => {},
    setIsGenerating: () => {},
    setCurrentSession: () => {},
    addPendingPermission: (permission) => {
      setPendingPermissions((prev) => {
        if (prev.has(permission.permissionKey)) {
          return prev
        }
        const next = new Map(prev)
        next.set(permission.permissionKey, permission)
        return next
      })
    },
    removePendingPermission: (permissionKey) => {
      setPendingPermissions((prev) => {
        if (!prev.has(permissionKey)) {
          return prev
        }
        const next = new Map(prev)
        next.delete(permissionKey)
        return next
      })
    },
    clearPendingPermissionsForSession: (sessionId) => {
      setPendingPermissions((prev) => {
        let changed = false
        const next = new Map(prev)
        for (const [permissionKey, permission] of next) {
          if (permission.sessionId === sessionId) {
            changed = true
            next.delete(permissionKey)
          }
        }
        return changed ? next : prev
      })
    },
    updateTicketAgentStatus: () => {},
    getTicketAgentStatus: () => undefined,
    addActiveSession: () => {},
    removeActiveSession: () => {},
    setDefaultBackendType: () => {},
    setSmartLabelIds: () => {},
  }), [pendingPermissions, currentProjectId])

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

describe('NotificationBell permission key handling', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('renders same-requestId permissions separately and keeps card after Allow until server resolves', async () => {
    render(
      <TestProvider>
        <NotificationBell />
      </TestProvider>
    )

    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('Permission A')).toBeDefined()
    expect(screen.getByText('Permission B')).toBeDefined()

    const allowButtons = screen.getAllByRole('button', { name: 'Allow' })
    fireEvent.click(allowButtons[0] as HTMLButtonElement)

    expect(mockSend).toHaveBeenCalledWith({
      type: 'permission.response',
      kombuseSessionId: 'chat-alpha',
      requestId: 'req-1',
      behavior: 'allow',
      updatedInput: { command: 'ls' },
    })

    // Non-optimistic: both permissions stay visible; Allow button shows "Sending..." state
    await waitFor(() => {
      expect(screen.getByText('Permission A')).toBeDefined()
      expect(screen.getByText('Permission B')).toBeDefined()
      expect(screen.getByText('Sending...')).toBeDefined()
    })
  })

  it('removes permission card only when server resolves via removePendingPermission', async () => {
    const RemoveButton = () => {
      const { removePendingPermission } = useAppContext()
      return (
        <button onClick={() => removePendingPermission('chat-alpha:req-1')}>
          Simulate resolve
        </button>
      )
    }

    render(
      <TestProvider>
        <NotificationBell />
        <RemoveButton />
      </TestProvider>
    )

    // Click the bell button (first button) to open popover
    const allButtons = screen.getAllByRole('button')
    fireEvent.click(allButtons[0] as HTMLButtonElement)

    expect(screen.getByText('Permission A')).toBeDefined()
    expect(screen.getByText('Permission B')).toBeDefined()

    // Simulate server resolving permission A
    fireEvent.click(screen.getByText('Simulate resolve'))

    await waitFor(() => {
      expect(screen.queryByText('Permission A')).toBeNull()
      expect(screen.getByText('Permission B')).toBeDefined()
    })
  })

  it('navigates to ticket with session query when both ticket and session ids exist', () => {
    const onNavigate = vi.fn()

    render(
      <TestProvider
        initialPermissions={[
          createPermission({
            permissionKey: 'chat-ticket:req-1',
            sessionId: 'chat-ticket',
            requestId: 'req-1',
            toolName: 'AskUserQuestion',
            input: {
              questions: [
                {
                  question: 'Proceed?',
                  options: [{ label: 'Yes' }],
                },
              ],
            },
            description: 'Needs user input',
            ticketNumber: 42,
            projectId: '1',
          }),
        ]}
      >
        <NotificationBell onNavigate={onNavigate} />
      </TestProvider>
    )

    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }))

    expect(onNavigate).toHaveBeenCalledWith('/projects/1/tickets/42?session=chat-ticket')
  })

  it('falls back to chat route when ticket id is unavailable', () => {
    const onNavigate = vi.fn()

    render(
      <TestProvider
        initialPermissions={[
          createPermission({
            permissionKey: 'chat-only:req-1',
            sessionId: 'chat-only',
            requestId: 'req-1',
            toolName: 'AskUserQuestion',
            input: {
              questions: [
                {
                  question: 'Proceed?',
                  options: [{ label: 'Yes' }],
                },
              ],
            },
            description: 'Needs user input',
            projectId: '1',
          }),
        ]}
      >
        <NotificationBell onNavigate={onNavigate} />
      </TestProvider>
    )

    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }))

    expect(onNavigate).toHaveBeenCalledWith('/projects/1/chats/chat-only')
  })
})

describe('NotificationBell project scoping', () => {
  beforeEach(() => {
    mockSend.mockReset()
    mockedUseProfileSetting.mockReturnValue({ data: null } as any)
  })

  it('filters permissions by project when scope is project (default)', () => {
    render(
      <TestProvider
        initialPermissions={[
          createPermission({
            permissionKey: 'sess-a:req-1',
            sessionId: 'sess-a',
            requestId: 'req-1',
            toolName: 'Bash',
            input: { command: 'ls' },
            description: 'Same project',
            projectId: '1',
          }),
          createPermission({
            permissionKey: 'sess-b:req-1',
            sessionId: 'sess-b',
            requestId: 'req-1',
            toolName: 'Bash',
            input: { command: 'pwd' },
            description: 'Other project',
            projectId: '2',
          }),
        ]}
      >
        <NotificationBell />
      </TestProvider>
    )

    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('Same project')).toBeDefined()
    expect(screen.queryByText('Other project')).toBeNull()
  })

  it('shows all permissions when scope is all', () => {
    mockedUseProfileSetting.mockReturnValue({
      data: { setting_value: 'all' },
    } as any)

    render(
      <TestProvider
        initialPermissions={[
          createPermission({
            permissionKey: 'sess-a:req-1',
            sessionId: 'sess-a',
            requestId: 'req-1',
            toolName: 'Bash',
            input: { command: 'ls' },
            description: 'Same project',
            projectId: '1',
          }),
          createPermission({
            permissionKey: 'sess-b:req-1',
            sessionId: 'sess-b',
            requestId: 'req-1',
            toolName: 'Bash',
            input: { command: 'pwd' },
            description: 'Other project',
            projectId: '2',
          }),
        ]}
      >
        <NotificationBell />
      </TestProvider>
    )

    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('Same project')).toBeDefined()
    expect(screen.getByText('Other project')).toBeDefined()
  })

  it('hides permissions without projectId when scope is project', () => {
    render(
      <TestProvider
        initialPermissions={[
          createPermission({
            permissionKey: 'sess-c:req-1',
            sessionId: 'sess-c',
            requestId: 'req-1',
            toolName: 'Bash',
            input: { command: 'echo hi' },
            description: 'No project set',
          }),
        ]}
      >
        <NotificationBell />
      </TestProvider>
    )

    fireEvent.click(screen.getByRole('button'))

    expect(screen.queryByText('No project set')).toBeNull()
  })

  it('shows empty state when currentProjectId is null and scope is project', () => {
    render(
      <TestProvider
        currentProjectId={null}
        initialPermissions={[
          createPermission({
            permissionKey: 'sess-d:req-1',
            sessionId: 'sess-d',
            requestId: 'req-1',
            toolName: 'Bash',
            input: { command: 'ls' },
            description: 'Should be hidden',
            projectId: '1',
          }),
        ]}
      >
        <NotificationBell />
      </TestProvider>
    )

    fireEvent.click(screen.getByRole('button'))

    expect(screen.queryByText('Should be hidden')).toBeNull()
  })
})
