import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '../lib/api'

export function useSessionsPerDay(projectId: string, days?: number) {
  return useQuery({
    queryKey: ['analytics', 'sessions-per-day', projectId, days],
    queryFn: () => analyticsApi.sessionsPerDay(projectId, days),
    enabled: !!projectId,
  })
}
