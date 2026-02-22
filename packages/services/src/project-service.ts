import type {
  Project,
  ProjectFilters,
  CreateProjectInput,
  UpdateProjectInput,
} from '@kombuse/types'
import { projectsRepository } from '@kombuse/persistence'

/**
 * Service interface for project operations
 */
export interface IProjectService {
  list(filters?: ProjectFilters): Project[]
  get(id: string): Project | null
  getByIdOrSlug(identifier: string): Project | null
  create(input: CreateProjectInput): Project
  update(id: string, input: UpdateProjectInput): Project
  delete(id: string): void
}

/**
 * Project service implementation with business logic
 */
export class ProjectService implements IProjectService {
  list(filters?: ProjectFilters): Project[] {
    return projectsRepository.list(filters)
  }

  get(id: string): Project | null {
    return projectsRepository.get(id)
  }

  getByIdOrSlug(identifier: string): Project | null {
    return projectsRepository.getByIdOrSlug(identifier)
  }

  create(input: CreateProjectInput): Project {
    return projectsRepository.create(input)
  }

  update(id: string, input: UpdateProjectInput): Project {
    const existing = projectsRepository.get(id)
    if (!existing) {
      throw new Error(`Project ${id} not found`)
    }

    const updated = projectsRepository.update(id, input)
    if (!updated) {
      throw new Error(`Failed to update project ${id}`)
    }

    return updated
  }

  delete(id: string): void {
    const success = projectsRepository.delete(id)
    if (!success) {
      throw new Error(`Project ${id} not found`)
    }
  }
}

// Singleton instance for convenience
export const projectService = new ProjectService()
