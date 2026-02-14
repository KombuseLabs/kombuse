import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useMemo, useState, type ReactNode } from 'react'
import type { AppContextValue, PendingPermission } from '@kombuse/types'
import { NotificationBell } from '../notification-bell'
import { AppCtx } from '../../providers/app-context'

const mockSend = vi.fn()

vi.mock('../../hooks/use-websocket', () => ({
  useWebSocket: () => ({
    isConnected: true,
    send: mockSend,
  }),
}))

function createPermission(permission: PendingPermission): PendingPermission {
  return permission
}

function TestProvider({ children }: { children: ReactNode }) {
  const [pendingPermissions, setPendingPermissions] = useState(
    new Map<string, PendingPermission>([
      ['chat-alpha:req-1', createPermission({
        permissionKey: 'chat-alpha:req-1',
        sessionId: 'chat-alpha',
        requestId: 'req-1',
        toolName: 'Bash',
        input: { command: 'ls' },
        description: 'Permission A',
      })],
      ['chat-beta:req-1', createPermission({
        permissionKey: 'chat-beta:req-1',
        sessionId: 'chat-beta',
        requestId: 'req-1',
        toolName: 'Bash',
        input: { command: 'pwd' },
        description: 'Permission B',
      })],
    ])
  )

  const value = useMemo<AppContextValue>(() => ({
    currentTicket: null,
    currentProjectId: '1',
    view: null,
    isGenerating: false,
    currentSession: null,
    pendingPermissions,
    ticketAgentStatus: new Map(),
    activeSessions: new Map(),
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
  }), [pendingPermissions])

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

describe('NotificationBell permission key handling', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('renders same-requestId permissions separately and removes only the selected permission', async () => {
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

    await waitFor(() => {
      expect(screen.queryByText('Permission A')).toBeNull()
      expect(screen.getByText('Permission B')).toBeDefined()
    })
  })
})
