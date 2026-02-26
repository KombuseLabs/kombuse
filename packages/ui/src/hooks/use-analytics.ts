import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '../lib/api'
import { analyticsKeys } from '../lib/query-keys'

export function useSessionsPerDay(projectId: string, days?: number) {
  return useQuery({
    queryKey: analyticsKeys.sessionsPerDay(projectId, days),
    queryFn: () => analyticsApi.sessionsPerDay(projectId, days),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useDurationPercentiles(projectId: string, days?: number) {
  return useQuery({
    queryKey: analyticsKeys.durationPercentiles(projectId, days),
    queryFn: () => analyticsApi.durationPercentiles(projectId, days),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function usePipelineStageDuration(projectId: string, days?: number) {
  return useQuery({
    queryKey: analyticsKeys.pipelineStageDuration(projectId, days),
    queryFn: () => analyticsApi.pipelineStageDuration(projectId, days),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useMostFrequentReads(projectId: string, days?: number, limit?: number) {
  return useQuery({
    queryKey: analyticsKeys.mostFrequentReads(projectId, days, limit),
    queryFn: () => analyticsApi.mostFrequentReads(projectId, days, limit),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useToolCallsPerSession(projectId: string, days?: number, agentId?: string) {
  return useQuery({
    queryKey: analyticsKeys.toolCallsPerSession(projectId, days, agentId),
    queryFn: () => analyticsApi.toolCallsPerSession(projectId, days, agentId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useSlowestTools(projectId: string, days?: number) {
  return useQuery({
    queryKey: analyticsKeys.slowestTools(projectId, days),
    queryFn: () => analyticsApi.slowestTools(projectId, days),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useToolCallVolume(projectId: string, days?: number) {
  return useQuery({
    queryKey: analyticsKeys.toolCallVolume(projectId, days),
    queryFn: () => analyticsApi.toolCallVolume(projectId, days),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useTicketBurndown(
  projectId: string,
  days?: number,
  milestoneId?: number,
  labelId?: number,
) {
  return useQuery({
    queryKey: analyticsKeys.ticketBurndown(projectId, days, milestoneId, labelId),
    queryFn: () => analyticsApi.ticketBurndown(projectId, days, milestoneId, labelId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useAgentRuntimePerTicket(projectId: string, limit?: number) {
  return useQuery({
    queryKey: analyticsKeys.agentRuntimePerTicket(projectId, limit),
    queryFn: () => analyticsApi.agentRuntimePerTicket(projectId, limit),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
