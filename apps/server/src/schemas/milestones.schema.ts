import { z } from 'zod'

export const createMilestoneSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  due_date: z.string().optional(),
})

export const updateMilestoneSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  status: z.enum(['open', 'closed']).optional(),
})

export const milestoneFiltersSchema = z.object({
  status: z.enum(['open', 'closed']).optional(),
})

export type CreateMilestoneBody = z.infer<typeof createMilestoneSchema>
export type UpdateMilestoneBody = z.infer<typeof updateMilestoneSchema>
export type MilestoneFiltersQuery = z.infer<typeof milestoneFiltersSchema>
