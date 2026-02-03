import { z } from 'zod'

export const createProjectSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  owner_id: z.string().min(1),
  local_path: z.string().optional(),
  repo_source: z.enum(['github', 'gitlab', 'bitbucket']).optional(),
  repo_owner: z.string().optional(),
  repo_name: z.string().optional(),
})

export const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  local_path: z.string().optional(),
  repo_source: z.enum(['github', 'gitlab', 'bitbucket']).optional(),
  repo_owner: z.string().optional(),
  repo_name: z.string().optional(),
})

export const projectFiltersSchema = z.object({
  owner_id: z.string().optional(),
  repo_source: z.enum(['github', 'gitlab', 'bitbucket']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

export type CreateProjectBody = z.infer<typeof createProjectSchema>
export type UpdateProjectBody = z.infer<typeof updateProjectSchema>
export type ProjectFiltersQuery = z.infer<typeof projectFiltersSchema>
