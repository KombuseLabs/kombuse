import { analyticsRepository, milestonesRepository } from '@kombuse/persistence'
import type {
  SessionDurationPercentile,
  PipelineStageDuration,
  ToolReadFrequency,
  ToolCallsPerSession,
  ToolDurationPercentile,
  ToolCallVolume,
  BurndownEntry,
} from '@kombuse/types'

export interface IAnalyticsService {
  sessionsPerDay(projectId: string, days?: number): Array<{ date: string; count: number }>
  durationPercentiles(projectId: string, days?: number): SessionDurationPercentile[]
  pipelineStageDuration(projectId: string, days?: number): PipelineStageDuration[]
  mostFrequentReads(projectId: string, days?: number, limit?: number): ToolReadFrequency[]
  toolCallsPerSession(projectId: string, days?: number, agentId?: string): ToolCallsPerSession[]
  slowestTools(projectId: string, days?: number): ToolDurationPercentile[]
  toolCallVolume(projectId: string, days?: number): ToolCallVolume[]
  ticketBurndown(projectId: string, days?: number, milestoneId?: number, labelId?: number): BurndownEntry[]
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

  ticketBurndown(projectId: string, days?: number, milestoneId?: number, labelId?: number): BurndownEntry[] {
    const raw = analyticsRepository.ticketBurndown(projectId, days, milestoneId, labelId)
    if (raw.length === 0) return []

    let dueDate: string | null = null
    if (milestoneId !== undefined) {
      const milestone = milestonesRepository.get(milestoneId)
      dueDate = milestone?.due_date ?? null
    }

    const startDate = raw[0]!.date
    const startTotal = raw[0]!.total

    return raw.map((entry) => {
      let ideal: number | null = null
      if (dueDate && startTotal > 0) {
        const startMs = new Date(startDate + 'T00:00:00Z').getTime()
        const dueMs = new Date(dueDate + 'T00:00:00Z').getTime()
        const currentMs = new Date(entry.date + 'T00:00:00Z').getTime()
        const totalSpan = dueMs - startMs
        if (totalSpan > 0) {
          const elapsed = currentMs - startMs
          const ratio = Math.min(elapsed / totalSpan, 1)
          ideal = Math.max(0, Math.round(startTotal * (1 - ratio)))
        }
      }
      return { ...entry, ideal }
    })
  }
}

export const analyticsService = new AnalyticsService()
