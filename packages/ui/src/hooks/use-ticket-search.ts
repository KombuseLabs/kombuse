import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ticketsApi } from '../lib/api'

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

export function useTicketSearch(
  query: string,
  options?: { enabled?: boolean; projectId?: string | null }
) {
  const enabled = options?.enabled ?? query.length > 0
  const debouncedQuery = useDebouncedValue(query, 200)

  return useQuery({
    queryKey: ['tickets', 'search', debouncedQuery, options?.projectId ?? null],
    queryFn: () =>
      ticketsApi.list({
        ...(debouncedQuery ? { search: debouncedQuery } : {}),
        ...(options?.projectId ? { project_id: options.projectId } : {}),
        limit: 10,
      }),
    enabled,
  })
}
