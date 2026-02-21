import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { profilesApi } from '../lib/api'

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

export function useProfileSearch(query: string, options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? query.length > 0
  const debouncedQuery = useDebouncedValue(query, 200)

  return useQuery({
    queryKey: ['profiles', 'search', debouncedQuery],
    queryFn: () =>
      profilesApi.list({
        ...(debouncedQuery ? { search: debouncedQuery } : {}),
        type: 'agent',
        is_active: true,
        has_agent: true,
        limit: 10,
      }),
    enabled,
  })
}
