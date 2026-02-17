import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '../lib/api'

export function useSessionsPerDay(projectId: string, days?: number) {
  return useQuery({
    queryKey: ['analytics', 'sessions-per-day', projectId, days],
    queryFn: () => analyticsApi.sessionsPerDay(projectId, days),
    enabled: !!projectId,
  })
}

export function useDurationPercentiles(projectId: string, days?: number) {
  return useQuery({
    queryKey: ['analytics', 'duration-percentiles', projectId, days],
    queryFn: () => analyticsApi.durationPercentiles(projectId, days),
    enabled: !!projectId,
  })
}

export function usePipelineStageDuration(projectId: string, days?: number) {
  return useQuery({
    queryKey: ['analytics', 'pipeline-stage-duration', projectId, days],
    queryFn: () => analyticsApi.pipelineStageDuration(projectId, days),
    enabled: !!projectId,
  })
}
