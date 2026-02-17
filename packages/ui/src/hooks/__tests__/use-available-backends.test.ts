import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import type { BackendStatus } from '@kombuse/types'

const mockGetStatus = vi.fn()

vi.mock('../../lib/api', () => ({
  backendStatusApi: {
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
    refreshStatus: vi.fn(),
  },
}))

import { useAvailableBackends } from '../use-available-backends'

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
})

describe('useAvailableBackends', () => {
  it('returns all user-facing backends while loading', () => {
    mockGetStatus.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useAvailableBackends(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.availableBackends).toEqual(['claude-code', 'codex'])
    expect(result.current.isAvailable('claude-code')).toBe(true)
    expect(result.current.isAvailable('codex')).toBe(true)
    expect(result.current.noneAvailable).toBe(false)
  })

  it('returns both backends when both are available', async () => {
    const statuses: BackendStatus[] = [
      { backendType: 'claude-code', available: true, version: '1.0.0', path: '/usr/bin/claude' },
      { backendType: 'codex', available: true, version: '0.3.0', path: '/usr/bin/codex' },
    ]
    mockGetStatus.mockResolvedValue(statuses)

    const { result } = renderHook(() => useAvailableBackends(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.availableBackends).toEqual(['claude-code', 'codex'])
    expect(result.current.isAvailable('claude-code')).toBe(true)
    expect(result.current.isAvailable('codex')).toBe(true)
    expect(result.current.noneAvailable).toBe(false)
  })

  it('returns only available backends when one is missing', async () => {
    const statuses: BackendStatus[] = [
      { backendType: 'claude-code', available: true, version: '1.0.0', path: '/usr/bin/claude' },
      { backendType: 'codex', available: false, version: null, path: null },
    ]
    mockGetStatus.mockResolvedValue(statuses)

    const { result } = renderHook(() => useAvailableBackends(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.availableBackends).toEqual(['claude-code'])
    expect(result.current.isAvailable('claude-code')).toBe(true)
    expect(result.current.isAvailable('codex')).toBe(false)
    expect(result.current.noneAvailable).toBe(false)
  })

  it('returns empty list and noneAvailable when no backends are available', async () => {
    const statuses: BackendStatus[] = [
      { backendType: 'claude-code', available: false, version: null, path: null },
      { backendType: 'codex', available: false, version: null, path: null },
    ]
    mockGetStatus.mockResolvedValue(statuses)

    const { result } = renderHook(() => useAvailableBackends(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.availableBackends).toEqual([])
    expect(result.current.noneAvailable).toBe(true)
  })

  it('excludes mock from availableBackends even if available', async () => {
    const statuses: BackendStatus[] = [
      { backendType: 'claude-code', available: true, version: '1.0.0', path: '/usr/bin/claude' },
      { backendType: 'codex', available: false, version: null, path: null },
      { backendType: 'mock', available: true, version: null, path: null },
    ]
    mockGetStatus.mockResolvedValue(statuses)

    const { result } = renderHook(() => useAvailableBackends(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.availableBackends).toEqual(['claude-code'])
    expect(result.current.isAvailable('mock')).toBe(true)
  })
})
