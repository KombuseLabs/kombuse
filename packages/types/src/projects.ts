/**
 * Repository source types
 */
export type RepoSource = 'github' | 'gitlab' | 'bitbucket'

/**
 * Core project entity
 */
export interface Project {
  id: string
  name: string
  description: string | null
  owner_id: string
  local_path: string | null
  repo_source: RepoSource | null
  repo_owner: string | null
  repo_name: string | null
  created_at: string
  updated_at: string
}

/**
 * Input for creating a project
 */
export interface CreateProjectInput {
  id?: string
  name: string
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
