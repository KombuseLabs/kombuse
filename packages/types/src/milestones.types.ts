import type { z } from 'zod'
import type {
  milestoneStatusSchema,
  milestoneSchema,
  milestoneWithStatsSchema,
} from './schemas/entities'

// Derived from Zod schemas (single source of truth)
export type MilestoneStatus = z.infer<typeof milestoneStatusSchema>
export type Milestone = z.infer<typeof milestoneSchema>
export type MilestoneWithStats = z.infer<typeof milestoneWithStatsSchema>

export interface CreateMilestoneInput {
  project_id: string
  title: string
  description?: string
  due_date?: string
}

export interface UpdateMilestoneInput {
  title?: string
  description?: string | null
  due_date?: string | null
  status?: MilestoneStatus
}

export interface MilestoneFilters {
  project_id?: string
  status?: MilestoneStatus
}
