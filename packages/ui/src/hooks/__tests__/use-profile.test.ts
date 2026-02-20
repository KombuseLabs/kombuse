import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import type { Profile } from '@kombuse/types'

const mockGet = vi.fn()

vi.mock('../../lib/api', () => ({
  profilesApi: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

import { useProfile, useCurrentUserProfile } from '../use-profile'

const TEST_PROFILE: Profile = {
  id: 'user-1',
  type: 'user',
  name: 'Test User',
  slug: null,
  email: 'test@example.com',
  description: 'A test user',
  avatar_url: 'bot',
  external_source: null,
  external_id: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

beforeEach(() => {
  mockGet.mockReset()
  mockGet.mockResolvedValue(TEST_PROFILE)
})

describe('useProfile', () => {
  it('should fetch profile by id', async () => {
    const { result } = renderHook(() => useProfile('user-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockGet).toHaveBeenCalledWith('user-1')
    expect(result.current.data).toEqual(TEST_PROFILE)
  })

  it('should not fetch when id is empty', () => {
    const { result } = renderHook(() => useProfile(''), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(false)
    expect(mockGet).not.toHaveBeenCalled()
  })
})

describe('useCurrentUserProfile', () => {
  it('should fetch profile for user-1', async () => {
    const { result } = renderHook(() => useCurrentUserProfile(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockGet).toHaveBeenCalledWith('user-1')
    expect(result.current.data).toEqual(TEST_PROFILE)
  })
})
