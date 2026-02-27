import type { z } from 'zod'
import type { projectRepoSourceSchema, projectSchema } from './schemas/entities'

// Derived from Zod schemas (single source of truth)
export type RepoSource = z.infer<typeof projectRepoSourceSchema>
export type Project = z.infer<typeof projectSchema>

/**
 * Input for creating a project
 */
export interface CreateProjectInput {
  id?: string
  name: string
  slug?: string
  description?: string
  owner_id: string
  local_path?: string
  repo_source?: RepoSource
  repo_owner?: string
  repo_name?: string
}

/**
 * Input for updating a project
 */
export interface UpdateProjectInput {
  name?: string
  slug?: string
  description?: string
  local_path?: string
  repo_source?: RepoSource
  repo_owner?: string
  repo_name?: string
}

/**
 * Filters for listing projects
 */
export interface ProjectFilters {
  owner_id?: string
  repo_source?: RepoSource
  search?: string
  limit?: number
  offset?: number
}
