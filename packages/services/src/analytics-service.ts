import { analyticsRepository } from '@kombuse/persistence'
import type {
  SessionDurationPercentile,
  PipelineStageDuration,
  ToolReadFrequency,
  ToolCallsPerSession,
  ToolDurationPercentile,
  ToolCallVolume,
} from '@kombuse/types'

export interface IAnalyticsService {
  sessionsPerDay(projectId: string, days?: number): Array<{ date: string; count: number }>
  durationPercentiles(projectId: string, days?: number): SessionDurationPercentile[]
  pipelineStageDuration(projectId: string, days?: number): PipelineStageDuration[]
  mostFrequentReads(projectId: string, days?: number, limit?: number): ToolReadFrequency[]
  toolCallsPerSession(projectId: string, days?: number, agentId?: string): ToolCallsPerSession[]
  slowestTools(projectId: string, days?: number): ToolDurationPercentile[]
  toolCallVolume(projectId: string, days?: number): ToolCallVolume[]
}

export class AnalyticsService implements IAnalyticsService {
  sessionsPerDay(projectId: string, days?: number): Array<{ date: string; count: number }> {
    return analyticsRepository.sessionsPerDay(projectId, days)
  }

  durationPercentiles(projectId: string, days?: number): SessionDurationPercentile[] {
    return analyticsRepository.durationPercentiles(projectId, days)
  }

  pipelineStageDuration(projectId: string, days?: number): PipelineStageDuration[] {
    return analyticsRepository.pipelineStageDuration(projectId, days)
  }

  mostFrequentReads(projectId: string, days?: number, limit?: number): ToolReadFrequency[] {
    return analyticsRepository.mostFrequentReads(projectId, days, limit)
  }

  toolCallsPerSession(projectId: string, days?: number, agentId?: string): ToolCallsPerSession[] {
    return analyticsRepository.toolCallsPerSession(projectId, days, agentId)
  }

  slowestTools(projectId: string, days?: number): ToolDurationPercentile[] {
    return analyticsRepository.slowestTools(projectId, days)
  }

  toolCallVolume(projectId: string, days?: number): ToolCallVolume[] {
    return analyticsRepository.toolCallVolume(projectId, days)
  }
}

export const analyticsService = new AnalyticsService()
