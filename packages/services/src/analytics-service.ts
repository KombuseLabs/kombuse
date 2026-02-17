import { analyticsRepository } from '@kombuse/persistence'
import type { SessionDurationPercentile, PipelineStageDuration } from '@kombuse/types'

export interface IAnalyticsService {
  sessionsPerDay(projectId: string, days?: number): Array<{ date: string; count: number }>
  durationPercentiles(projectId: string, days?: number): SessionDurationPercentile[]
  pipelineStageDuration(projectId: string, days?: number): PipelineStageDuration[]
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
}

export const analyticsService = new AnalyticsService()
