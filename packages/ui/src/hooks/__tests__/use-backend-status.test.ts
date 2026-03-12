import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import type { BackendStatus } from '@kombuse/types'

const mockGetStatus = vi.fn()
const mockRefreshStatus = vi.fn()

vi.mock('@/lib/api', () => ({
  backendStatusApi: {
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
    refreshStatus: (...args: unknown[]) => mockRefreshStatus(...args),
  },
}))

import { useBackendStatus, useRefreshBackendStatus } from '../use-backend-status'

const TEST_STATUSES: BackendStatus[] = [
  {
    backendType: 'claude-code',
    available: true,
    version: '1.0.16',
    path: '/usr/local/bin/claude',
    meetsMinimum: false,
    minimumVersion: '1.0.40',
    nodeVersion: null,
    meetsNodeMinimum: true,
    minimumNodeVersion: null,
  },
  {
    backendType: 'codex',
    available: false,
    version: null,
    path: null,
    meetsMinimum: false,
    minimumVersion: '0.100.0',
    nodeVersion: null,
    meetsNodeMinimum: true,
    minimumNodeVersion: null,
  },
]

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

beforeEach(() => {
  mockGetStatus.mockReset()
  mockRefreshStatus.mockReset()
  mockGetStatus.mockResolvedValue(TEST_STATUSES)
  mockRefreshStatus.mockResolvedValue(TEST_STATUSES)
})

describe('useBackendStatus', () => {
  it('should fetch backend statuses', async () => {
    const { result } = renderHook(() => useBackendStatus(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockGetStatus).toHaveBeenCalled()
    expect(result.current.data).toEqual(TEST_STATUSES)
  })

  it('should return loading state initially', () => {
    mockGetStatus.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useBackendStatus(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })
})

describe('useRefreshBackendStatus', () => {
  it('should call refreshStatus API on mutate', async () => {
    const refreshedStatuses: BackendStatus[] = [
      {
        backendType: 'claude-code',
        available: true,
        version: '1.0.17',
        path: '/usr/local/bin/claude',
        meetsMinimum: false,
        minimumVersion: '1.0.40',
        nodeVersion: null,
        meetsNodeMinimum: true,
        minimumNodeVersion: null,
      },
      {
        backendType: 'codex',
        available: true,
        version: '0.3.2',
        path: '/usr/local/bin/codex',
        meetsMinimum: false,
        minimumVersion: '0.100.0',
        nodeVersion: null,
        meetsNodeMinimum: true,
        minimumNodeVersion: null,
      },
    ]
    mockRefreshStatus.mockResolvedValue(refreshedStatuses)

    const { result } = renderHook(() => useRefreshBackendStatus(), {
      wrapper: createWrapper(),
    })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockRefreshStatus).toHaveBeenCalled()
  })
})
