import { z } from 'zod'

export const createLabelSchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  description: z.string().optional(),
})

export const updateLabelSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  description: z.string().optional(),
})

export const labelFiltersSchema = z.object({
  search: z.string().optional(),
  sort: z.enum(['name', 'usage']).optional(),
  usage_scope: z.enum(['open']).optional(),
})

export type CreateLabelBody = z.infer<typeof createLabelSchema>
export type UpdateLabelBody = z.infer<typeof updateLabelSchema>
export type LabelFiltersQuery = z.infer<typeof labelFiltersSchema>
