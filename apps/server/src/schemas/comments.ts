import { z } from 'zod'

export const createCommentSchema = z.object({
  author_id: z.string().min(1),
  parent_id: z.coerce.number().int().positive().optional(),
  body: z.string().min(1),
  external_source: z.string().optional(),
  external_id: z.string().optional(),
})

export const updateCommentSchema = z.object({
  body: z.string().min(1).optional(),
})

export const commentFiltersSchema = z.object({
  author_id: z.string().optional(),
  parent_id: z.coerce.number().int().nullable().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

export type CreateCommentBody = z.infer<typeof createCommentSchema>
export type UpdateCommentBody = z.infer<typeof updateCommentSchema>
export type CommentFiltersQuery = z.infer<typeof commentFiltersSchema>
