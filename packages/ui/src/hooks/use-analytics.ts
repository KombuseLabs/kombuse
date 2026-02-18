import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '../lib/api'

export function useSessionsPerDay(projectId: string, days?: number, enabled = true) {
  return useQuery({
    queryKey: ['analytics', 'sessions-per-day', projectId, days],
    queryFn: () => analyticsApi.sessionsPerDay(projectId, days),
    enabled: !!projectId && enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useDurationPercentiles(projectId: string, days?: number, enabled = true) {
  return useQuery({
    queryKey: ['analytics', 'duration-percentiles', projectId, days],
    queryFn: () => analyticsApi.durationPercentiles(projectId, days),
    enabled: !!projectId && enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function usePipelineStageDuration(projectId: string, days?: number, enabled = true) {
  return useQuery({
    queryKey: ['analytics', 'pipeline-stage-duration', projectId, days],
    queryFn: () => analyticsApi.pipelineStageDuration(projectId, days),
    enabled: !!projectId && enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useMostFrequentReads(projectId: string, days?: number, limit?: number, enabled = true) {
  return useQuery({
    queryKey: ['analytics', 'most-frequent-reads', projectId, days, limit],
    queryFn: () => analyticsApi.mostFrequentReads(projectId, days, limit),
    enabled: !!projectId && enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useToolCallsPerSession(projectId: string, days?: number, agentId?: string, enabled = true) {
  return useQuery({
    queryKey: ['analytics', 'tool-calls-per-session', projectId, days, agentId],
    queryFn: () => analyticsApi.toolCallsPerSession(projectId, days, agentId),
    enabled: !!projectId && enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useSlowestTools(projectId: string, days?: number, enabled = true) {
  return useQuery({
    queryKey: ['analytics', 'slowest-tools', projectId, days],
    queryFn: () => analyticsApi.slowestTools(projectId, days),
    enabled: !!projectId && enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useToolCallVolume(projectId: string, days?: number, enabled = true) {
  return useQuery({
    queryKey: ['analytics', 'tool-call-volume', projectId, days],
    queryFn: () => analyticsApi.toolCallVolume(projectId, days),
    enabled: !!projectId && enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
