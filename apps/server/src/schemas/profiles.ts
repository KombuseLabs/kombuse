import { z } from 'zod'

export const createProfileSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['user', 'agent']),
  name: z.string().min(1),
  email: z.string().email().optional(),
  description: z.string().optional(),
  avatar_url: z.string().optional(), // Can be URL or icon name
  external_source: z.string().optional(),
  external_id: z.string().optional(),
})

export const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  description: z.string().optional(),
  avatar_url: z.string().optional(), // Can be URL or icon name
  is_active: z.boolean().optional(),
})

export const profileFiltersSchema = z.object({
  type: z.enum(['user', 'agent']).optional(),
  is_active: z.coerce.boolean().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

export type CreateProfileBody = z.infer<typeof createProfileSchema>
export type UpdateProfileBody = z.infer<typeof updateProfileSchema>
export type ProfileFiltersQuery = z.infer<typeof profileFiltersSchema>
