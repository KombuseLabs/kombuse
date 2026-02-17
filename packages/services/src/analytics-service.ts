import { analyticsRepository } from '@kombuse/persistence'

export interface IAnalyticsService {
  sessionsPerDay(projectId: string, days?: number): Array<{ date: string; count: number }>
}

export class AnalyticsService implements IAnalyticsService {
  sessionsPerDay(projectId: string, days?: number): Array<{ date: string; count: number }> {
    return analyticsRepository.sessionsPerDay(projectId, days)
  }
}

export const analyticsService = new AnalyticsService()
